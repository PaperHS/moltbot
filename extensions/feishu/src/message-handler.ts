import type * as lark from "@larksuiteoapi/node-sdk";
import type { ClawdbotConfig, RuntimeEnv, Logger } from "clawdbot/plugin-sdk";

import type { FeishuMessageEvent } from "./types.js";
import {
  extractSenderId,
  extractChatId,
  extractMessageId,
  extractMessageText,
  extractImageKey,
  isPrivateChat,
  isGroupChat,
  wasBotMentioned,
} from "./inbound.js";
import { downloadFeishuImage, sendFeishuText } from "./send.js";
import { getFeishuRuntime } from "./runtime.js";

export type HandleFeishuMessageOpts = {
  cfg: ClawdbotConfig;
  runtime: RuntimeEnv;
  log: Logger;
  event: FeishuMessageEvent;
  client: lark.Client;
  appId: string;
};

/**
 * Check if sender is allowed based on policy and allowlist.
 */
function isAllowed(params: {
  cfg: ClawdbotConfig;
  senderId: string;
  chatId: string;
  isPrivate: boolean;
}): { allowed: boolean; reason?: string } {
  const { cfg, senderId, chatId, isPrivate } = params;
  const feishuCfg = cfg.channels?.feishu;

  if (isPrivate) {
    const dmPolicy = feishuCfg?.dmPolicy ?? "pairing";
    if (dmPolicy === "disabled") {
      return { allowed: false, reason: "DM disabled" };
    }
    if (dmPolicy === "open") {
      return { allowed: true };
    }
    // pairing mode - check allowlist
    const allowFrom = feishuCfg?.allowFrom ?? [];
    if (allowFrom.includes("*") || allowFrom.includes(senderId)) {
      return { allowed: true };
    }
    return { allowed: false, reason: "not in allowlist" };
  }

  // Group chat
  const groupPolicy = feishuCfg?.groupPolicy ?? "allowlist";
  if (groupPolicy === "open") {
    return { allowed: true };
  }

  // Check group allowlist
  const groupAllowFrom = feishuCfg?.groupAllowFrom ?? [];
  if (groupAllowFrom.includes("*") || groupAllowFrom.includes(chatId)) {
    return { allowed: true };
  }

  return { allowed: false, reason: "group not in allowlist" };
}

/**
 * Handle incoming Feishu message.
 */
export async function handleFeishuMessage(opts: HandleFeishuMessageOpts): Promise<void> {
  const { cfg, log, event, appId } = opts;
  const feishuCfg = cfg.channels?.feishu;

  const senderId = extractSenderId(event);
  const chatId = extractChatId(event);
  const messageId = extractMessageId(event);

  if (!senderId || !chatId || !messageId) {
    log.debug("missing required fields, skipping message");
    return;
  }

  const isPrivate = isPrivateChat(event);
  const isGroup = isGroupChat(event);

  log.debug("processing message", {
    senderId,
    chatId,
    messageId,
    isPrivate,
    isGroup,
  });

  // Check if bot was mentioned in group (if required)
  if (isGroup && feishuCfg?.requireMention !== false) {
    if (!wasBotMentioned(event, appId)) {
      log.debug("bot not mentioned in group, skipping");
      return;
    }
  }

  // Check allowlist
  const { allowed, reason } = isAllowed({ cfg, senderId, chatId, isPrivate });
  if (!allowed) {
    log.debug("sender not allowed", { senderId, chatId, reason });
    return;
  }

  // Extract message content
  const text = extractMessageText(event);
  const imageKey = extractImageKey(event);

  if (!text && !imageKey) {
    log.debug("no text or image content, skipping");
    return;
  }

  log.info("handling message", {
    senderId,
    chatId,
    messageId,
    hasText: Boolean(text),
    hasImage: Boolean(imageKey),
  });

  // Handle image if present
  let imageBuffer: Buffer | undefined;
  if (imageKey) {
    try {
      imageBuffer = await downloadFeishuImage({
        cfg,
        messageId,
        imageKey,
      });
      log.debug("downloaded image", { imageKey, size: imageBuffer.length });
    } catch (err) {
      log.error("failed to download image", {
        error: err instanceof Error ? err.message : String(err),
        imageKey,
      });
    }
  }

  // Determine reply target (chat_id for groups, sender open_id for DMs)
  const replyTo = isPrivate ? senderId : chatId;
  const sessionKey = `feishu:${isPrivate ? senderId : chatId}`;

  // Get runtime
  const core = getFeishuRuntime();
  const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "feishu");

  // Build finalized inbound context
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: text ?? "",
    RawBody: text ?? "",
    CommandBody: text ?? "",
    From: `feishu:${senderId}`,
    To: `feishu:${replyTo}`,
    SessionKey: sessionKey,
    ChatType: isPrivate ? "direct" : "group",
    ConversationLabel: isPrivate ? `feishu:${senderId}` : `feishu:group:${chatId}`,
    GroupSubject: isGroup ? chatId : undefined,
    SenderName: undefined,
    SenderId: senderId,
    Provider: "feishu" as const,
    Surface: "feishu" as const,
    MessageSid: messageId,
    ...(imageBuffer
      ? {
          Media: [{ buffer: imageBuffer, mimeType: "image/png" }],
        }
      : {}),
  });

  // Create dispatcher using the proper reply dispatcher pattern
  const { dispatcher } = core.channel.reply.createReplyDispatcherWithTyping({
    deliver: async (payload) => {
      // Send text content
      if (payload.text) {
        const chunks = core.channel.text.chunkMarkdownText(payload.text, textLimit);
        for (const chunk of chunks) {
          await sendFeishuText({ cfg, to: replyTo, text: chunk });
        }
      }
      // Send media URL as text (Feishu image upload would require separate implementation)
      if (payload.mediaUrl) {
        await sendFeishuText({ cfg, to: replyTo, text: payload.mediaUrl });
      }
    },
    onError: (err, info) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("reply delivery failed", {
        kind: info.kind,
        error: errorMsg,
      });
    },
  });

  try {
    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
    });

    log.info("dispatch complete", { queuedFinal, counts });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("[feishu] dispatch error:", errorMsg, errorStack);
    log.error("failed to dispatch reply", {
      error: errorMsg,
      stack: errorStack,
      senderId,
      chatId,
    });

    // Send error message
    try {
      await sendFeishuText({
        cfg,
        to: replyTo,
        text: "Sorry, an error occurred while processing your message.",
      });
    } catch {
      // Ignore send error
    }
  }
}
