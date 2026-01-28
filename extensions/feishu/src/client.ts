import * as lark from "@larksuiteoapi/node-sdk";
import type { FeishuCredentials } from "./types.js";

let clientInstance: lark.Client | null = null;
let currentCredentials: FeishuCredentials | null = null;

/**
 * Create or return existing Feishu SDK client.
 */
export function getFeishuClient(credentials: FeishuCredentials): lark.Client {
  // Return existing client if credentials match
  if (
    clientInstance &&
    currentCredentials?.appId === credentials.appId &&
    currentCredentials?.appSecret === credentials.appSecret
  ) {
    return clientInstance;
  }

  // Create new client
  clientInstance = new lark.Client({
    appId: credentials.appId,
    appSecret: credentials.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu, // 飞书国内版
  });

  currentCredentials = credentials;
  return clientInstance;
}

/**
 * Create a fresh Feishu SDK client (not cached).
 */
export function createFeishuClient(credentials: FeishuCredentials): lark.Client {
  return new lark.Client({
    appId: credentials.appId,
    appSecret: credentials.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });
}

/**
 * Create WebSocket client for long-polling connection.
 * EventDispatcher must be provided with registered handlers.
 */
export function createFeishuWsClient(
  credentials: FeishuCredentials,
  eventDispatcher: lark.EventDispatcher,
): lark.WSClient {
  return new lark.WSClient({
    appId: credentials.appId,
    appSecret: credentials.appSecret,
    domain: lark.Domain.Feishu,
    eventDispatcher,
  });
}

/**
 * Create event dispatcher for webhook mode.
 */
export function createFeishuEventDispatcher(options?: {
  encryptKey?: string;
  verificationToken?: string;
}): lark.EventDispatcher {
  return new lark.EventDispatcher({
    encryptKey: options?.encryptKey,
    verificationToken: options?.verificationToken,
  });
}
