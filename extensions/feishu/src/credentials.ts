import type { FeishuConfig, FeishuCredentials } from "./types.js";

/**
 * Resolve Feishu credentials from config or environment variables.
 */
export function resolveFeishuCredentials(cfg?: FeishuConfig): FeishuCredentials | undefined {
  const appId = cfg?.appId?.trim() || process.env.FEISHU_APP_ID?.trim();
  const appSecret = cfg?.appSecret?.trim() || process.env.FEISHU_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    return undefined;
  }

  return { appId, appSecret };
}
