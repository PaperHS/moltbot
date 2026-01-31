import type * as lark from "@larksuiteoapi/node-sdk";
import type { OpenClawConfig, RuntimeEnv, Logger } from "openclaw/plugin-sdk";

import type { FeishuMessageEvent } from "./types.js";
import {
  extractSenderId,
  extractChatId,
  extractMessageId,
  extractMessageText,
  extractImageKeys,
  extractParentId,
  isPrivateChat,
  isGroupChat,
  wasBotMentioned,
  parseFeishuTextContent,
} from "./inbound.js";
import {
  downloadFeishuImage,
  sendFeishuText,
  uploadFeishuImage,
  sendFeishuImage,
  uploadFeishuFile,
  sendFeishuFile,
  detectFeishuFileType,
  getFeishuMessage,
} from "./send.js";
import { getFeishuRuntime } from "./runtime.js";

export type HandleFeishuMessageOpts = {
  cfg: OpenClawConfig;
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
  cfg: OpenClawConfig;
  senderId: string;
  chatId: string;
  isPrivate: boolean;
}): { allowed: boolean; reason?: string } {
  const { cfg, senderId, chatId, isPrivate } = params;
  const feishuCfg = cfg.channels?.feishu;

  if (isPrivate) {
    const dmPolicy = feishuCfg?.dmPolicy ?? "open";
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
  const groupPolicy = feishuCfg?.groupPolicy ?? "open";
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
  const imageKeys = extractImageKeys(event);
  const parentId = extractParentId(event);

  console.log("[feishu] extracted content:", { text, imageKeys, parentId });

  if (!text && imageKeys.length === 0) {
    console.log("[feishu] no text or image content, skipping");
    return;
  }

  console.log("[feishu] handling message:", {
    senderId,
    chatId,
    messageId,
    hasText: Boolean(text),
    imageCount: imageKeys.length,
    hasParent: Boolean(parentId),
  });

  // Fetch quoted message if present
  let replyToBody: string | undefined;
  let replyToSender: string | undefined;
  if (parentId) {
    try {
      const quotedMessage = await getFeishuMessage({ cfg, messageId: parentId });
      if (quotedMessage?.content && quotedMessage.messageType === "text") {
        const parsed = parseFeishuTextContent(quotedMessage.content);
        replyToBody = parsed?.text;
      }
      replyToSender = quotedMessage?.senderId;
      console.log("[feishu] fetched quoted message:", { replyToBody, replyToSender });
    } catch (err) {
      log.debug("failed to fetch quoted message", {
        error: err instanceof Error ? err.message : String(err),
        parentId,
      });
    }
  }

  // Download all images if present
  console.log("[feishu] Starting image download, count:", imageKeys.length);
  const imageBuffers: Buffer[] = [];
  for (const imageKey of imageKeys) {
    console.log("[feishu] Downloading image:", imageKey);
    try {
      const buffer = await downloadFeishuImage({
        cfg,
        messageId,
        imageKey,
      });
      imageBuffers.push(buffer);
      console.log("[feishu] Downloaded image successfully:", { imageKey, size: buffer.length });
      log.debug("downloaded image", { imageKey, size: buffer.length });
    } catch (err) {
      console.error("[feishu] Failed to download image:", imageKey, err);
      log.error("failed to download image", {
        error: err instanceof Error ? err.message : String(err),
        imageKey,
      });
    }
  }
  console.log("[feishu] Image download complete, buffers:", imageBuffers.length);

  // Determine reply target (chat_id for groups, sender open_id for DMs)
  const replyTo = isPrivate ? senderId : chatId;
  const sessionKey = `feishu:${isPrivate ? senderId : chatId}`;

  // Get runtime
  const core = getFeishuRuntime();
  const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "feishu");

  // Format reply suffix (similar to Telegram pattern)
  const replySuffix =
    parentId && replyToBody
      ? `\n\n[Replying to ${replyToSender ?? "unknown"}${parentId ? ` id:${parentId}` : ""}]\n${replyToBody}\n[/Replying]`
      : "";

  // Build full body with reply context
  const fullBody = `${text ?? ""}${replySuffix}`;

  // Build finalized inbound context
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: fullBody,
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
    ...(parentId
      ? {
          ReplyToId: parentId,
          ReplyToBody: replyToBody,
          ReplyToSender: replyToSender,
          ReplyToIsQuote: true,
        }
      : {}),
    ...(imageBuffers.length > 0
      ? {
          Media: imageBuffers.map((buffer) => ({ buffer, mimeType: "image/png" })),
        }
      : {}),
  });

  console.log("[feishu] Built context payload:", {
    Body: ctxPayload.Body,
    hasReplyToId: Boolean(ctxPayload.ReplyToId),
    ReplyToId: ctxPayload.ReplyToId,
    ReplyToBody: ctxPayload.ReplyToBody ? `${ctxPayload.ReplyToBody.substring(0, 100)}...` : undefined,
    ReplyToIsQuote: ctxPayload.ReplyToIsQuote,
    mediaCount: imageBuffers.length,
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
    console.log("[feishu] Starting dispatch with context:", {
      from: ctxPayload.From,
      to: ctxPayload.To,
      sessionKey: ctxPayload.SessionKey,
      bodyLength: ctxPayload.Body?.length,
      hasReplyTo: Boolean(ctxPayload.ReplyToId),
    });

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
    });

    console.log("[feishu] Dispatch complete:", { queuedFinal, counts });
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

  console.log("[feishu] handleFeishuMessage finished");
}
