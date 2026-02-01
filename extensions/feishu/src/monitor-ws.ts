import type * as lark from "@larksuiteoapi/node-sdk";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { Logger } from "openclaw/plugin-sdk";

import { createFeishuWsClient, createFeishuClient, createFeishuEventDispatcher } from "./client.js";
import { resolveFeishuCredentials } from "./credentials.js";
import type { FeishuMessageEvent } from "./types.js";
import { handleFeishuMessage } from "./message-handler.js";

export type MonitorFeishuWsOpts = {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  log: Logger;
  abortSignal?: AbortSignal;
};

export type MonitorFeishuWsResult = {
  wsClient: lark.WSClient;
  shutdown: () => Promise<void>;
};

/**
 * Start Feishu WebSocket long-polling connection.
 */
export async function monitorFeishuWs(opts: MonitorFeishuWsOpts): Promise<MonitorFeishuWsResult> {
  const { cfg, runtime, log, abortSignal } = opts;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const client = createFeishuClient(credentials);

  // Create event dispatcher and register message handler
  const eventDispatcher = createFeishuEventDispatcher();

  eventDispatcher.register({
    "im.message.receive_v1": async (data: FeishuMessageEvent) => {
      // Log raw event structure for debugging
      console.log("[feishu] RAW EVENT:", JSON.stringify(data, null, 2));

      console.log("[feishu] calling handleFeishuMessage...");
      try {
        await handleFeishuMessage({
          cfg,
          runtime,
          log,
          event: data,
          client,
          appId: credentials.appId,
        });
        console.log("[feishu] handleFeishuMessage completed");
      } catch (err) {
        console.error("[feishu] handleFeishuMessage ERROR:", err instanceof Error ? err.message : String(err));
        console.error("[feishu] stack:", err instanceof Error ? err.stack : "no stack");
        log.error("failed to handle message", {
          error: err instanceof Error ? err.message : String(err),
          messageId: data.message?.message_id ?? data.event?.message?.message_id,
        });
      }
    },
  });

  // Create WebSocket client
  const wsClient = createFeishuWsClient(credentials);

  // Start WebSocket connection with event dispatcher
  log.info("starting WebSocket connection");
  await wsClient.start({ eventDispatcher });

  const shutdown = async () => {
    log.info("shutting down WebSocket connection");
    // The SDK doesn't have explicit close method, but we can stop processing
    // by letting the connection timeout or be garbage collected
  };

  // Handle abort signal
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      void shutdown();
    });
  }

  return { wsClient, shutdown };
}
