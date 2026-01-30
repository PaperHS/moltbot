import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { getFeishuClient } from "./client.js";
import { resolveFeishuCredentials } from "./credentials.js";
import type { FeishuSendResult } from "./types.js";

export type SendFeishuTextParams = {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
};

export type SendFeishuImageParams = {
  cfg: ClawdbotConfig;
  to: string;
  imageKey: string;
  replyToMessageId?: string;
};

/**
 * Determine the receive_id_type based on the target format.
 * - open_id: starts with "ou_"
 * - chat_id: starts with "oc_"
 * - user_id: other format
 */
function resolveReceiveIdType(to: string): "open_id" | "chat_id" | "user_id" {
  if (to.startsWith("ou_")) {
    return "open_id";
  }
  if (to.startsWith("oc_")) {
    return "chat_id";
  }
  return "user_id";
}

/**
 * Send a text message via Feishu API.
 */
export async function sendFeishuText(params: SendFeishuTextParams): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);
  const receiveIdType = resolveReceiveIdType(to);

  const content = JSON.stringify({ text });

  const response = await client.im.message.create({
    params: {
      receive_id_type: receiveIdType,
    },
    data: {
      receive_id: to,
      msg_type: "text",
      content,
      ...(replyToMessageId ? { reply_in_thread: false } : {}),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu send failed: ${response.msg} (code: ${response.code})`);
  }

  const messageId = response.data?.message_id ?? "unknown";
  const chatId = response.data?.chat_id ?? to;

  return { messageId, chatId };
}

/**
 * Send an image message via Feishu API.
 */
export async function sendFeishuImage(params: SendFeishuImageParams): Promise<FeishuSendResult> {
  const { cfg, to, imageKey, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);
  const receiveIdType = resolveReceiveIdType(to);

  const content = JSON.stringify({ image_key: imageKey });

  const response = await client.im.message.create({
    params: {
      receive_id_type: receiveIdType,
    },
    data: {
      receive_id: to,
      msg_type: "image",
      content,
      ...(replyToMessageId ? { reply_in_thread: false } : {}),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu image send failed: ${response.msg} (code: ${response.code})`);
  }

  const messageId = response.data?.message_id ?? "unknown";
  const chatId = response.data?.chat_id ?? to;

  return { messageId, chatId };
}

/**
 * Reply to a message in Feishu.
 */
export async function replyFeishuText(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  text: string;
}): Promise<FeishuSendResult> {
  const { cfg, messageId, text } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);
  const content = JSON.stringify({ text });

  const response = await client.im.message.reply({
    path: {
      message_id: messageId,
    },
    data: {
      msg_type: "text",
      content,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu reply failed: ${response.msg} (code: ${response.code})`);
  }

  const replyMessageId = response.data?.message_id ?? "unknown";
  const chatId = response.data?.chat_id ?? "unknown";

  return { messageId: replyMessageId, chatId };
}

/**
 * Upload an image to Feishu and get the image_key.
 */
export async function uploadFeishuImage(params: {
  cfg: ClawdbotConfig;
  image: Buffer;
  imageType?: "message" | "avatar";
}): Promise<string> {
  const { cfg, image, imageType = "message" } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);

  const response = await client.im.image.create({
    data: {
      image_type: imageType,
      image: Buffer.from(image),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu image upload failed: ${response.msg} (code: ${response.code})`);
  }

  const imageKey = response.data?.image_key;
  if (!imageKey) {
    throw new Error("Feishu image upload returned no image_key");
  }

  return imageKey;
}

/**
 * Upload a file to Feishu and get the file_key.
 */
export async function uploadFeishuFile(params: {
  cfg: ClawdbotConfig;
  file: Buffer;
  fileName: string;
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
}): Promise<string> {
  const { cfg, file, fileName, fileType } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);

  const response = await client.im.file.create({
    data: {
      file_type: fileType,
      file_name: fileName,
      file: Buffer.from(file),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu file upload failed: ${response.msg} (code: ${response.code})`);
  }

  const fileKey = response.data?.file_key;
  if (!fileKey) {
    throw new Error("Feishu file upload returned no file_key");
  }

  return fileKey;
}

/**
 * Send a file message via Feishu API.
 */
export async function sendFeishuFile(params: {
  cfg: ClawdbotConfig;
  to: string;
  fileKey: string;
  replyToMessageId?: string;
}): Promise<FeishuSendResult> {
  const { cfg, to, fileKey, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);
  const receiveIdType = resolveReceiveIdType(to);

  const content = JSON.stringify({ file_key: fileKey });

  const response = await client.im.message.create({
    params: {
      receive_id_type: receiveIdType,
    },
    data: {
      receive_id: to,
      msg_type: "file",
      content,
      ...(replyToMessageId ? { reply_in_thread: false } : {}),
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu file send failed: ${response.msg} (code: ${response.code})`);
  }

  const messageId = response.data?.message_id ?? "unknown";
  const chatId = response.data?.chat_id ?? to;

  return { messageId, chatId };
}

/**
 * Detect file type from URL or content-type header.
 */
export function detectFeishuFileType(
  url: string,
  contentType?: string,
): { isImage: boolean; fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream"; fileName: string } {
  const urlLower = url.toLowerCase();
  const ext = urlLower.split(".").pop()?.split("?")[0] ?? "";

  // Check content-type first
  if (contentType) {
    if (contentType.startsWith("image/")) {
      return { isImage: true, fileType: "stream", fileName: `image.${ext || "png"}` };
    }
    if (contentType.includes("pdf")) {
      return { isImage: false, fileType: "pdf", fileName: `file.pdf` };
    }
    if (contentType.includes("audio")) {
      return { isImage: false, fileType: "opus", fileName: `audio.${ext || "opus"}` };
    }
    if (contentType.includes("video") || contentType.includes("mp4")) {
      return { isImage: false, fileType: "mp4", fileName: `video.mp4` };
    }
    if (contentType.includes("word") || contentType.includes("document")) {
      return { isImage: false, fileType: "doc", fileName: `document.docx` };
    }
    if (contentType.includes("excel") || contentType.includes("spreadsheet")) {
      return { isImage: false, fileType: "xls", fileName: `spreadsheet.xlsx` };
    }
    if (contentType.includes("powerpoint") || contentType.includes("presentation")) {
      return { isImage: false, fileType: "ppt", fileName: `presentation.pptx` };
    }
  }

  // Fallback to extension detection
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "svg"];
  if (imageExts.includes(ext)) {
    return { isImage: true, fileType: "stream", fileName: `image.${ext}` };
  }

  const fileTypeMap: Record<string, "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream"> = {
    pdf: "pdf",
    doc: "doc",
    docx: "doc",
    xls: "xls",
    xlsx: "xls",
    ppt: "ppt",
    pptx: "ppt",
    mp4: "mp4",
    opus: "opus",
    ogg: "opus",
    mp3: "opus",
    wav: "opus",
  };

  const fileType = fileTypeMap[ext] ?? "stream";
  const fileName = url.split("/").pop()?.split("?")[0] ?? `file.${ext || "bin"}`;

  return { isImage: false, fileType, fileName };
}

/**
 * Download an image from Feishu.
 */
export async function downloadFeishuImage(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  imageKey: string;
}): Promise<Buffer> {
  const { cfg, messageId, imageKey } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);

  const response = await client.im.messageResource.get({
    path: {
      message_id: messageId,
      file_key: imageKey,
    },
    params: {
      type: "image",
    },
  });

  // The response should be a readable stream or buffer
  if (!response) {
    throw new Error("Feishu image download returned no data");
  }

  // Handle stream response
  if (typeof (response as NodeJS.ReadableStream).read === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of response as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // Handle buffer response
  if (Buffer.isBuffer(response)) {
    return response;
  }

  throw new Error("Feishu image download returned unexpected format");
}

/**
 * Get message content by message_id.
 * Used to fetch quoted/referenced message details.
 */
export async function getFeishuMessage(params: {
  cfg: ClawdbotConfig;
  messageId: string;
}): Promise<{
  messageType?: string;
  content?: string;
  senderId?: string;
  senderName?: string;
} | null> {
  const { cfg, messageId } = params;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = getFeishuClient(credentials);

  try {
    const response = await client.im.message.get({
      path: {
        message_id: messageId,
      },
    });

    if (response.code !== 0 || !response.data?.items?.[0]) {
      return null;
    }

    const message = response.data.items[0];
    return {
      messageType: message.msg_type,
      content: message.body?.content,
      senderId: message.sender?.id?.open_id,
      senderName: message.sender?.sender_type === "user" ? undefined : message.sender?.sender_type,
    };
  } catch {
    return null;
  }
}
