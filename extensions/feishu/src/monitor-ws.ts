import type * as lark from "@larksuiteoapi/node-sdk";
import type { ClawdbotConfig, RuntimeEnv } from "clawdbot/plugin-sdk";
import type { Logger } from "clawdbot/plugin-sdk";

import { createFeishuWsClient, createFeishuClient, createFeishuEventDispatcher } from "./client.js";
import { resolveFeishuCredentials } from "./credentials.js";
import type { FeishuMessageEvent } from "./types.js";
import { handleFeishuMessage } from "./message-handler.js";

export type MonitorFeishuWsOpts = {
  cfg: ClawdbotConfig;
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
      log.debug("received message event", {
        messageId: data.event?.message?.message_id,
        chatType: data.event?.message?.chat_type,
        messageType: data.event?.message?.message_type,
      });

      try {
        await handleFeishuMessage({
          cfg,
          runtime,
          log,
          event: data,
          client,
          appId: credentials.appId,
        });
      } catch (err) {
        log.error("failed to handle message", {
          error: err instanceof Error ? err.message : String(err),
          messageId: data.event?.message?.message_id,
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
