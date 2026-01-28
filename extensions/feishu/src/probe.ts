import { createFeishuClient } from "./client.js";
import { resolveFeishuCredentials } from "./credentials.js";
import type { FeishuConfig } from "./types.js";

export type ProbeFeishuResult = {
  ok: boolean;
  error?: string;
  appId?: string;
  botName?: string;
};

/**
 * Probe Feishu credentials by attempting to get bot info.
 */
export async function probeFeishu(cfg?: FeishuConfig): Promise<ProbeFeishuResult> {
  const creds = resolveFeishuCredentials(cfg);
  if (!creds) {
    return {
      ok: false,
      error: "missing credentials (appId, appSecret)",
    };
  }

  try {
    const client = createFeishuClient(creds);

    // Get bot info to verify credentials work
    const response = await client.bot.botInfo.get();

    if (response.code !== 0) {
      return {
        ok: false,
        appId: creds.appId,
        error: `API error: ${response.msg} (code: ${response.code})`,
      };
    }

    return {
      ok: true,
      appId: creds.appId,
      botName: response.data?.app_name,
    };
  } catch (err) {
    return {
      ok: false,
      appId: creds.appId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
