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
import {
  downloadFeishuImage,
  sendFeishuText,
  uploadFeishuImage,
  sendFeishuImage,
  uploadFeishuFile,
  sendFeishuFile,
  detectFeishuFileType,
} from "./send.js";
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

  console.log("[feishu] handleFeishuMessage called");

  const senderId = extractSenderId(event);
  const chatId = extractChatId(event);
  const messageId = extractMessageId(event);

  console.log("[feishu] extracted IDs:", { senderId, chatId, messageId });

  if (!senderId || !chatId || !messageId) {
    console.log("[feishu] missing required fields, skipping");
    log.debug("missing required fields, skipping message");
    return;
  }

  const isPrivate = isPrivateChat(event);
  const isGroup = isGroupChat(event);

  console.log("[feishu] chat type:", { isPrivate, isGroup });

  // Check if bot was mentioned in group (if required)
  if (isGroup && feishuCfg?.requireMention !== false) {
    const mentioned = wasBotMentioned(event, appId);
    console.log("[feishu] requireMention check:", { requireMention: feishuCfg?.requireMention, mentioned });
    if (!mentioned) {
      console.log("[feishu] bot not mentioned in group, skipping");
      return;
    }
  }

  // Check allowlist
  const { allowed, reason } = isAllowed({ cfg, senderId, chatId, isPrivate });
  console.log("[feishu] allowlist check:", { allowed, reason, groupPolicy: feishuCfg?.groupPolicy });
  if (!allowed) {
    console.log("[feishu] sender not allowed:", reason);
    return;
  }

  // Extract message content
  const text = extractMessageText(event);
  const imageKey = extractImageKey(event);

  console.log("[feishu] extracted content:", { text, imageKey });

  if (!text && !imageKey) {
    console.log("[feishu] no text or image content, skipping");
    return;
  }

  console.log("[feishu] handling message:", { senderId, chatId, messageId, hasText: Boolean(text), hasImage: Boolean(imageKey) });

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
      // Send media: download from URL, detect type, upload to Feishu, then send
      if (payload.mediaUrl) {
        try {
          console.log("[feishu] downloading media from URL:", payload.mediaUrl);
          const response = await fetch(payload.mediaUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch media: ${response.status}`);
          }

          const contentType = response.headers.get("content-type") ?? undefined;
          const { isImage, fileType, fileName } = detectFeishuFileType(payload.mediaUrl, contentType);
          console.log("[feishu] detected media type:", { isImage, fileType, fileName, contentType });

          const arrayBuffer = await response.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          console.log("[feishu] downloaded media, size:", fileBuffer.length);

          if (isImage) {
            // Upload and send as image
            const imageKey = await uploadFeishuImage({ cfg, image: fileBuffer });
            console.log("[feishu] sending image with key:", imageKey);
            await sendFeishuImage({ cfg, to: replyTo, imageKey });
          } else {
            // Upload and send as file
            const fileKey = await uploadFeishuFile({ cfg, file: fileBuffer, fileName, fileType });
            console.log("[feishu] sending file with key:", fileKey);
            await sendFeishuFile({ cfg, to: replyTo, fileKey });
          }
        } catch (err) {
          // Fallback: send URL as text if upload fails
          console.error("[feishu] failed to send media, falling back to URL:", err);
          await sendFeishuText({ cfg, to: replyTo, text: `[Media] ${payload.mediaUrl}` });
        }
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
