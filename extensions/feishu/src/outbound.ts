import fs from "node:fs";
import type { ChannelOutboundAdapter } from "clawdbot/plugin-sdk";

import { getFeishuRuntime } from "./runtime.js";
import {
  sendFeishuText,
  uploadFeishuImage,
  sendFeishuImage,
  uploadFeishuFile,
  sendFeishuFile,
  detectFeishuFileType,
} from "./send.js";

/**
 * Determine if the URL is a local file path.
 */
function isLocalFilePath(url: string): boolean {
  // Check if it's NOT a remote URL or data URL
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return false;
  }
  // Check if file exists
  try {
    return fs.existsSync(url);
  } catch {
    return false;
  }
}

/**
 * Download media from URL.
 */
async function downloadMedia(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media from ${url}: ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? undefined;
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

/**
 * Determine if the media URL is an image.
 */
function isImageUrl(url: string, contentType?: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  const ext = url.toLowerCase().split(".").pop()?.split("?")[0] ?? "";
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "svg"].includes(ext);
}

/**
 * Determine if the media URL is audio/voice.
 */
function isAudioUrl(url: string, contentType?: string): boolean {
  if (contentType?.startsWith("audio/")) return true;
  const ext = url.toLowerCase().split(".").pop()?.split("?")[0] ?? "";
  return ["opus", "ogg", "mp3", "wav", "m4a", "aac"].includes(ext);
}

export const feishuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: (text, limit) => getFeishuRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,
  sendText: async ({ cfg, to, text }) => {
    const result = await sendFeishuText({ cfg, to, text });
    return { channel: "feishu", ...result };
  },
  sendMedia: async ({ cfg, to, text, mediaUrl }) => {
    console.log("[feishu:outbound] sendMedia called:", {
      to,
      hasText: Boolean(text),
      mediaUrl: mediaUrl ? `${mediaUrl.substring(0, 50)}...` : null,
    });

    // If there's text, send it first
    if (text) {
      console.log("[feishu:outbound] Sending text first");
      await sendFeishuText({ cfg, to, text });
    }

    // Handle media URL
    if (mediaUrl) {
      let buffer: Buffer | null = null;
      let contentType: string | undefined;

      // Handle base64 data URLs
      if (mediaUrl.startsWith("data:")) {
        console.log("[feishu:outbound] Processing base64 data URL");
        const match = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentType = match[1] ?? undefined;
          const base64Data = match[2];
          if (base64Data) {
            buffer = Buffer.from(base64Data, "base64");
            console.log("[feishu:outbound] Decoded base64, buffer size:", buffer.length);
          }
        }
      } else if (isLocalFilePath(mediaUrl)) {
        // Handle local file path
        console.log("[feishu:outbound] Processing local file path:", mediaUrl);
        try {
          buffer = fs.readFileSync(mediaUrl);
          console.log("[feishu:outbound] Read local file, size:", buffer.length);
          // Try to detect content type from file extension
          const ext = mediaUrl.toLowerCase().split(".").pop()?.split("?")[0];
          if (ext === "png") contentType = "image/png";
          else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
          else if (ext === "gif") contentType = "image/gif";
          else if (ext === "webp") contentType = "image/webp";
          else if (ext === "mp3") contentType = "audio/mpeg";
          else if (ext === "wav") contentType = "audio/wav";
          else if (ext === "ogg") contentType = "audio/ogg";
          else if (ext === "opus") contentType = "audio/opus";
          else if (ext === "mp4") contentType = "video/mp4";
          else if (ext === "pdf") contentType = "application/pdf";
          console.log("[feishu:outbound] Detected content type:", contentType);
        } catch (error) {
          console.error("[feishu:outbound] Failed to read local file:", error);
          // Fallback: send as text link if read fails
          const result = await sendFeishuText({
            cfg,
            to,
            text: `[Local file: ${mediaUrl}]`,
          });
          return { channel: "feishu", ...result };
        }
      } else {
        // Download from remote URL
        console.log("[feishu:outbound] Downloading from remote URL:", mediaUrl);
        try {
          const downloaded = await downloadMedia(mediaUrl);
          buffer = downloaded.buffer;
          contentType = downloaded.contentType;
          console.log("[feishu:outbound] Downloaded, size:", buffer.length, "type:", contentType);
        } catch (error) {
          console.error("[feishu:outbound] Failed to download media:", error);
          // Fallback: send as text link if download fails
          const result = await sendFeishuText({
            cfg,
            to,
            text: `[Media](${mediaUrl})`,
          });
          return { channel: "feishu", ...result };
        }
      }

      if (buffer) {
        // Determine media type and send appropriately
        console.log("[feishu:outbound] Processing buffer, detecting media type");
        if (isImageUrl(mediaUrl, contentType)) {
          // Send as image
          console.log("[feishu:outbound] Detected as image, uploading...");
          const imageKey = await uploadFeishuImage({ cfg, image: buffer });
          console.log("[feishu:outbound] Image uploaded, sending message...");
          const result = await sendFeishuImage({ cfg, to, imageKey });
          console.log("[feishu:outbound] Image message sent successfully");
          return { channel: "feishu", ...result };
        } else if (isAudioUrl(mediaUrl, contentType)) {
          // Send as audio/voice file
          console.log("[feishu:outbound] Detected as audio, uploading...");
          const { fileType, fileName } = detectFeishuFileType(mediaUrl, contentType);
          const fileKey = await uploadFeishuFile({
            cfg,
            file: buffer,
            fileName,
            fileType: fileType === "opus" ? "opus" : "stream",
          });
          console.log("[feishu:outbound] Audio uploaded, sending message...");
          const result = await sendFeishuFile({ cfg, to, fileKey });
          console.log("[feishu:outbound] Audio message sent successfully");
          return { channel: "feishu", ...result };
        } else {
          // Send as generic file
          console.log("[feishu:outbound] Detected as generic file, uploading...");
          const { fileType, fileName } = detectFeishuFileType(mediaUrl, contentType);
          const fileKey = await uploadFeishuFile({
            cfg,
            file: buffer,
            fileName,
            fileType,
          });
          console.log("[feishu:outbound] File uploaded, sending message...");
          const result = await sendFeishuFile({ cfg, to, fileKey });
          console.log("[feishu:outbound] File message sent successfully");
          return { channel: "feishu", ...result };
        }
      }

      // Fallback: send as text link
      const result = await sendFeishuText({
        cfg,
        to,
        text: `[Media](${mediaUrl})`,
      });
      return { channel: "feishu", ...result };
    }

    // Fallback: send text only
    const result = await sendFeishuText({ cfg, to, text: text ?? "" });
    return { channel: "feishu", ...result };
  },
};
