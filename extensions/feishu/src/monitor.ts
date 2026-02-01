import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";

import { getFeishuRuntime } from "./runtime.js";
import { resolveFeishuCredentials } from "./credentials.js";
import { monitorFeishuWs } from "./monitor-ws.js";
import { monitorFeishuWebhook } from "./monitor-webhook.js";

export type MonitorFeishuOpts = {
  cfg: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
};

export type MonitorFeishuResult = {
  mode: "websocket" | "webhook";
  shutdown: () => Promise<void>;
};

/**
 * Start Feishu provider in configured mode (WebSocket or Webhook).
 */
export async function monitorFeishuProvider(opts: MonitorFeishuOpts): Promise<MonitorFeishuResult> {
  const core = getFeishuRuntime();
  const log = core.logging.getChildLogger({ name: "feishu" });

  const { cfg, abortSignal } = opts;
  const feishuCfg = cfg.channels?.feishu;

  if (!feishuCfg?.enabled) {
    log.debug("feishu provider disabled");
    return { mode: "websocket", shutdown: async () => {} };
  }

  const creds = resolveFeishuCredentials(feishuCfg);
  if (!creds) {
    log.error("feishu credentials not configured");
    return { mode: "websocket", shutdown: async () => {} };
  }

  const runtime: RuntimeEnv = opts.runtime ?? {
    log: console.log,
    error: console.error,
    exit: (code: number): never => {
      throw new Error(`exit ${code}`);
    },
  };

  const mode = feishuCfg.mode ?? "websocket";

  log.info(`starting feishu provider in ${mode} mode`);

  if (mode === "webhook") {
    const { shutdown } = await monitorFeishuWebhook({
      cfg,
      runtime,
      log,
      abortSignal,
    });
    return { mode: "webhook", shutdown };
  }

  // Default: WebSocket mode
  const { shutdown } = await monitorFeishuWs({
    cfg,
    runtime,
    log,
    abortSignal,
  });
  return { mode: "websocket", shutdown };
}
