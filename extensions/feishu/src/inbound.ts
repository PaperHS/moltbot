import type { FeishuMessageEvent, FeishuTextContent, FeishuImageContent } from "./types.js";

/**
 * Parse text content from Feishu message.
 */
export function parseFeishuTextContent(content: string): FeishuTextContent | null {
  try {
    const parsed = JSON.parse(content) as FeishuTextContent;
    return parsed.text ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parse image content from Feishu message.
 */
export function parseFeishuImageContent(content: string): FeishuImageContent | null {
  try {
    const parsed = JSON.parse(content) as FeishuImageContent;
    return parsed.image_key ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Extract sender open_id from message event.
 * SDK v2.0 uses flat structure (no "event" wrapper).
 */
export function extractSenderId(event: FeishuMessageEvent): string | undefined {
  // v2.0 schema: data.sender.sender_id.open_id
  // v1.0 schema: data.event.sender.sender_id.open_id
  return event.sender?.sender_id?.open_id ?? event.event?.sender?.sender_id?.open_id;
}

/**
 * Extract chat_id from message event.
 */
export function extractChatId(event: FeishuMessageEvent): string | undefined {
  return event.message?.chat_id ?? event.event?.message?.chat_id;
}

/**
 * Extract message_id from message event.
 */
export function extractMessageId(event: FeishuMessageEvent): string | undefined {
  return event.message?.message_id ?? event.event?.message?.message_id;
}

/**
 * Determine if the message is from a private chat (DM).
 */
export function isPrivateChat(event: FeishuMessageEvent): boolean {
  const chatType = event.message?.chat_type ?? event.event?.message?.chat_type;
  return chatType === "p2p";
}

/**
 * Determine if the message is from a group chat.
 */
export function isGroupChat(event: FeishuMessageEvent): boolean {
  const chatType = event.message?.chat_type ?? event.event?.message?.chat_type;
  return chatType === "group";
}

/**
 * Check if the bot was mentioned in a group message.
 */
export function wasBotMentioned(event: FeishuMessageEvent, _appId: string): boolean {
  const mentions = event.message?.mentions ?? event.event?.message?.mentions;
  if (!mentions || mentions.length === 0) return false;

  // Check if any mention exists (bot is typically the first @mention in group messages)
  for (const mention of mentions) {
    if (mention.id?.open_id) {
      return true;
    }
  }

  return false;
}

/**
 * Strip @mention tags from text content.
 * Feishu uses @_user_<n> format in text.
 */
export function stripMentionTags(text: string): string {
  // Remove @_user_N patterns
  return text.replace(/@_user_\d+/g, "").trim();
}

/**
 * Extract text from message event, stripping mentions.
 */
export function extractMessageText(event: FeishuMessageEvent): string | null {
  const content = event.message?.content ?? event.event?.message?.content;
  if (!content) return null;

  const messageType = event.message?.message_type ?? event.event?.message?.message_type;
  if (messageType !== "text") return null;

  const parsed = parseFeishuTextContent(content);
  if (!parsed) return null;

  return stripMentionTags(parsed.text);
}

/**
 * Extract image key from message event.
 */
export function extractImageKey(event: FeishuMessageEvent): string | null {
  const content = event.message?.content ?? event.event?.message?.content;
  if (!content) return null;

  const messageType = event.message?.message_type ?? event.event?.message?.message_type;
  if (messageType !== "image") return null;

  const parsed = parseFeishuImageContent(content);
  return parsed?.image_key ?? null;
}
