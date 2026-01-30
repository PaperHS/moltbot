import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
} from "openclaw/plugin-sdk";

import { FeishuConfigSchema } from "./config-schema.js";
import { resolveFeishuCredentials } from "./credentials.js";
import { feishuOnboardingAdapter } from "./onboarding.js";
import { feishuOutbound } from "./outbound.js";
import { probeFeishu } from "./probe.js";
import { sendFeishuText } from "./send.js";

type ResolvedFeishuAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
};

const meta = {
  id: "feishu",
  label: "Feishu",
  selectionLabel: "Feishu (飞书)",
  docsPath: "/channels/feishu",
  docsLabel: "feishu",
  blurb: "飞书/Lark messaging; WebSocket or Webhook.",
  aliases: ["lark"],
  order: 65,
} as const;

export const feishuPlugin: ChannelPlugin<ResolvedFeishuAccount> = {
  id: "feishu",
  meta: {
    ...meta,
  },
  onboarding: feishuOnboardingAdapter,
  pairing: {
    idLabel: "feishuOpenId",
    normalizeAllowEntry: (entry) => entry.replace(/^(feishu|lark):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      await sendFeishuText({
        cfg,
        to: id,
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: false,
    media: true,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- Feishu targeting: omit `target` to reply to the current chat. Explicit targets: user open_id (ou_xxx) for DMs, chat_id (oc_xxx) for groups.",
    ],
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: buildChannelConfigSchema(FeishuConfigSchema),
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg) => ({
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: cfg.channels?.feishu?.enabled !== false,
      configured: Boolean(resolveFeishuCredentials(cfg.channels?.feishu)),
    }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        feishu: {
          ...cfg.channels?.feishu,
          enabled,
        },
      },
    }),
    deleteAccount: ({ cfg }) => {
      const next = { ...cfg } as OpenClawConfig;
      const nextChannels = { ...cfg.channels };
      delete nextChannels.feishu;
      if (Object.keys(nextChannels).length > 0) {
        next.channels = nextChannels;
      } else {
        delete next.channels;
      }
      return next;
    },
    isConfigured: (_account, cfg) => Boolean(resolveFeishuCredentials(cfg.channels?.feishu)),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: ({ cfg }) => cfg.channels?.feishu?.allowFrom ?? [],
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    collectWarnings: ({ cfg }) => {
      const groupPolicy = cfg.channels?.feishu?.groupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- Feishu groups: groupPolicy="open" allows any member to trigger. Set channels.feishu.groupPolicy="allowlist" + channels.feishu.groupAllowFrom to restrict.`,
      ];
    },
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        feishu: {
          ...cfg.channels?.feishu,
          enabled: true,
        },
      },
    }),
  },
  messaging: {
    normalizeTarget: (target) => {
      const trimmed = target.trim();
      // Strip feishu: or lark: prefix if present
      const stripped = trimmed.replace(/^(feishu|lark):/i, "").trim();
      return stripped || null;
    },
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        // Strip feishu: or lark: prefix if present
        const stripped = trimmed.replace(/^(feishu|lark):/i, "").trim();
        // open_id starts with ou_, chat_id starts with oc_
        return stripped.startsWith("ou_") || stripped.startsWith("oc_");
      },
      hint: "<open_id|chat_id>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, query, limit }) => {
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();
      for (const entry of cfg.channels?.feishu?.allowFrom ?? []) {
        const trimmed = String(entry).trim();
        if (trimmed && trimmed !== "*") ids.add(trimmed);
      }
      return Array.from(ids)
        .map((raw) => raw.trim())
        .filter(Boolean)
        .filter((id) => id.startsWith("ou_"))
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }) as const);
    },
    listGroups: async ({ cfg, query, limit }) => {
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();
      for (const entry of cfg.channels?.feishu?.groupAllowFrom ?? []) {
        const trimmed = String(entry).trim();
        if (trimmed && trimmed !== "*") ids.add(trimmed);
      }
      return Array.from(ids)
        .map((raw) => raw.trim())
        .filter(Boolean)
        .filter((id) => id.startsWith("oc_"))
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "group", id }) as const);
    },
  },
  outbound: feishuOutbound,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      mode: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      mode: snapshot.mode ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ cfg }) => await probeFeishu(cfg.channels?.feishu),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      mode: runtime?.mode ?? null,
      probe,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorFeishuProvider } = await import("./monitor.js");
      const mode = ctx.cfg.channels?.feishu?.mode ?? "websocket";
      ctx.setStatus({ accountId: ctx.accountId, mode });
      ctx.log?.info(`starting feishu provider (${mode} mode)`);
      return monitorFeishuProvider({
        cfg: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
