import type { ChannelOutboundAdapter } from "clawdbot/plugin-sdk";

import { getFeishuRuntime } from "./runtime.js";
import { sendFeishuText, uploadFeishuImage, sendFeishuImage } from "./send.js";

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
    // If there's text, send it first
    if (text) {
      await sendFeishuText({ cfg, to, text });
    }

    // Handle media URL
    if (mediaUrl) {
      // If it's a base64 data URL, extract and upload
      if (mediaUrl.startsWith("data:")) {
        const match = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const base64Data = match[2];
          if (base64Data) {
            const buffer = Buffer.from(base64Data, "base64");
            const imageKey = await uploadFeishuImage({ cfg, image: buffer });
            const result = await sendFeishuImage({ cfg, to, imageKey });
            return { channel: "feishu", ...result };
          }
        }
      }

      // For remote URLs, we'd need to download first
      // For now, send as text link
      const result = await sendFeishuText({
        cfg,
        to,
        text: text ? "" : `[Image](${mediaUrl})`,
      });
      return { channel: "feishu", ...result };
    }

    // Fallback: send text only
    const result = await sendFeishuText({ cfg, to, text: text ?? "" });
    return { channel: "feishu", ...result };
  },
};
