import type { Request, Response } from "express";
import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { Logger } from "openclaw/plugin-sdk";

import { createFeishuEventDispatcher, createFeishuClient } from "./client.js";
import { resolveFeishuCredentials } from "./credentials.js";
import type { FeishuMessageEvent } from "./types.js";
import { handleFeishuMessage } from "./message-handler.js";

export type MonitorFeishuWebhookOpts = {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  log: Logger;
  abortSignal?: AbortSignal;
};

export type MonitorFeishuWebhookResult = {
  app: unknown;
  shutdown: () => Promise<void>;
};

/**
 * Start Feishu Webhook server.
 */
export async function monitorFeishuWebhook(
  opts: MonitorFeishuWebhookOpts,
): Promise<MonitorFeishuWebhookResult> {
  const { cfg, runtime, log, abortSignal } = opts;
  const feishuCfg = cfg.channels?.feishu;
  const credentials = resolveFeishuCredentials(feishuCfg);

  if (!credentials) {
    throw new Error("Feishu credentials not configured");
  }

  const port = feishuCfg?.webhook?.port ?? 3000;
  const path = feishuCfg?.webhook?.path ?? "/feishu/events";

  const eventDispatcher = createFeishuEventDispatcher({
    encryptKey: feishuCfg?.encryptKey,
    verificationToken: feishuCfg?.verificationToken,
  });

  const client = createFeishuClient(credentials);

  // Register message event handler
  eventDispatcher.register({
    "im.message.receive_v1": async (data: FeishuMessageEvent) => {
      log.debug("received message event via webhook", {
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

  // Create Express server
  const express = await import("express");
  const app = express.default();
  app.use(express.json());

  // Event endpoint
  app.post(path, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    // Handle URL verification challenge
    if (body.type === "url_verification") {
      const challenge = body.challenge as string;
      log.debug("handling URL verification challenge");
      res.json({ challenge });
      return;
    }

    // Process event
    void eventDispatcher
      .invoke(body)
      .then(() => {
        res.json({ ok: true });
      })
      .catch((err: unknown) => {
        log.error("event dispatch failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ error: "internal error" });
      });
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, channel: "feishu" });
  });

  log.info(`starting webhook server on port ${port}, path ${path}`);

  const httpServer = app.listen(port, () => {
    log.info(`feishu webhook server started on port ${port}`);
  });

  httpServer.on("error", (err) => {
    log.error("webhook server error", { error: String(err) });
  });

  const shutdown = async () => {
    log.info("shutting down webhook server");
    return new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) {
          log.debug("webhook server close error", { error: String(err) });
        }
        resolve();
      });
    });
  };

  // Handle abort signal
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      void shutdown();
    });
  }

  return { app, shutdown };
}
