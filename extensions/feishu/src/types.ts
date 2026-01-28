import type { z } from "zod";
import type { FeishuConfigSchema } from "./config-schema.js";

export type FeishuConfig = z.infer<typeof FeishuConfigSchema>;

export type FeishuCredentials = {
  appId: string;
  appSecret: string;
};

export type FeishuMode = "websocket" | "webhook";

/**
 * Feishu message event from im.message.receive_v1
 */
export type FeishuMessageEvent = {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      sender_type?: string;
      tenant_key?: string;
    };
    message?: {
      message_id?: string;
      root_id?: string;
      parent_id?: string;
      create_time?: string;
      update_time?: string;
      chat_id?: string;
      chat_type?: string; // "p2p" | "group"
      message_type?: string; // "text" | "image" | "post" | etc.
      content?: string; // JSON string
      mentions?: Array<{
        key?: string;
        id?: {
          open_id?: string;
          user_id?: string;
          union_id?: string;
        };
        name?: string;
        tenant_key?: string;
      }>;
    };
  };
};

/**
 * Parsed text content from Feishu message
 */
export type FeishuTextContent = {
  text: string;
};

/**
 * Parsed image content from Feishu message
 */
export type FeishuImageContent = {
  image_key: string;
};

/**
 * Chat type in Feishu
 */
export type FeishuChatType = "p2p" | "group";

/**
 * Send message result
 */
export type FeishuSendResult = {
  messageId: string;
  chatId: string;
};
