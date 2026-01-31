import type { FeishuMessageEvent, FeishuTextContent, FeishuImageContent } from "./types.js";

/**
 * Feishu Post (rich text) content structure.
 */
type FeishuPostElement =
  | { tag: "text"; text: string }
  | { tag: "at"; user_id: string; user_name?: string }
  | { tag: "img"; image_key: string; width?: number; height?: number }
  | { tag: string; [key: string]: unknown };

type FeishuPostContent = {
  title?: string;
  content?: FeishuPostElement[][];
};

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
 * Parse post (rich text) content from Feishu message.
 */
export function parseFeishuPostContent(content: string): FeishuPostContent | null {
  try {
    const parsed = JSON.parse(content) as FeishuPostContent;
    return parsed.content ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Extract text from post content, stripping @mentions.
 */
export function extractTextFromPost(post: FeishuPostContent): string {
  if (!post.content) return "";

  const textParts: string[] = [];
  for (const line of post.content) {
    for (const element of line) {
      if (element.tag === "text" && "text" in element) {
        textParts.push(element.text);
      }
    }
  }

  return textParts.join("").trim();
}

/**
 * Extract all image keys from post content.
 */
export function extractImageKeysFromPost(post: FeishuPostContent): string[] {
  if (!post.content) return [];

  const imageKeys: string[] = [];
  for (const line of post.content) {
    for (const element of line) {
      if (element.tag === "img" && "image_key" in element && typeof element.image_key === "string") {
        imageKeys.push(element.image_key);
      }
    }
  }

  return imageKeys;
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
 * Supports both "text" and "post" (rich text) message types.
 */
export function extractMessageText(event: FeishuMessageEvent): string | null {
  const content = event.message?.content ?? event.event?.message?.content;
  if (!content) return null;

  const messageType = event.message?.message_type ?? event.event?.message?.message_type;

  // Handle simple text messages
  if (messageType === "text") {
    const parsed = parseFeishuTextContent(content);
    if (!parsed) return null;
    return stripMentionTags(parsed.text);
  }

  // Handle rich text (post) messages
  if (messageType === "post") {
    const parsed = parseFeishuPostContent(content);
    if (!parsed) return null;
    const text = extractTextFromPost(parsed);
    return stripMentionTags(text);
  }

  return null;
}

/**
 * Extract image keys from message event.
 * Supports both "image" (single image) and "post" (rich text with images) message types.
 * Returns an array of image keys (empty if no images).
 */
export function extractImageKeys(event: FeishuMessageEvent): string[] {
  const content = event.message?.content ?? event.event?.message?.content;
  if (!content) return [];

  const messageType = event.message?.message_type ?? event.event?.message?.message_type;

  // Handle simple image messages
  if (messageType === "image") {
    const parsed = parseFeishuImageContent(content);
    return parsed?.image_key ? [parsed.image_key] : [];
  }

  // Handle rich text (post) messages with embedded images
  if (messageType === "post") {
    const parsed = parseFeishuPostContent(content);
    return parsed ? extractImageKeysFromPost(parsed) : [];
  }

  return [];
}

/**
 * @deprecated Use extractImageKeys instead (returns array)
 * Extract image key from message event (legacy single-image support).
 */
export function extractImageKey(event: FeishuMessageEvent): string | null {
  const keys = extractImageKeys(event);
  return keys.length > 0 ? keys[0] : null;
}

/**
 * Extract parent message ID (for quoted/replied messages).
 */
export function extractParentId(event: FeishuMessageEvent): string | undefined {
  return event.message?.parent_id ?? event.event?.message?.parent_id;
}

/**
 * Extract root message ID (for thread root).
 */
export function extractRootId(event: FeishuMessageEvent): string | undefined {
  return event.message?.root_id ?? event.event?.message?.root_id;
}
