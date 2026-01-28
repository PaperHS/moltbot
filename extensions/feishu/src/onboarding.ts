import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  ClawdbotConfig,
  DmPolicy,
  WizardPrompter,
} from "clawdbot/plugin-sdk";
import { addWildcardAllowFrom, DEFAULT_ACCOUNT_ID, formatDocsLink } from "clawdbot/plugin-sdk";

import { resolveFeishuCredentials } from "./credentials.js";

const channel = "feishu" as const;

function setFeishuDmPolicy(cfg: ClawdbotConfig, dmPolicy: DmPolicy): ClawdbotConfig {
  const allowFrom =
    dmPolicy === "open"
      ? addWildcardAllowFrom(cfg.channels?.feishu?.allowFrom)?.map((entry) => String(entry))
      : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

function setFeishuAllowFrom(cfg: ClawdbotConfig, allowFrom: string[]): ClawdbotConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...cfg.channels?.feishu,
        allowFrom,
      },
    },
  };
}

function parseAllowFromInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function looksLikeOpenId(value: string): boolean {
  return value.startsWith("ou_");
}

async function promptFeishuAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
}): Promise<ClawdbotConfig> {
  const existing = params.cfg.channels?.feishu?.allowFrom ?? [];
  await params.prompter.note(
    [
      "Allowlist Feishu users by open_id.",
      "You can find user open_id in the Feishu admin console or API.",
      "Examples:",
      "- ou_xxxxxxxxxxxxxxxxxxxxxxxxxx",
    ].join("\n"),
    "Feishu allowlist",
  );

  while (true) {
    const entry = await params.prompter.text({
      message: "Feishu allowFrom (open_id list)",
      placeholder: "ou_xxx, ou_yyy",
      initialValue: existing[0] ? String(existing[0]) : undefined,
      validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
    });
    const parts = parseAllowFromInput(String(entry));
    if (parts.length === 0) {
      await params.prompter.note("Enter at least one user.", "Feishu allowlist");
      continue;
    }

    // Validate format
    const invalid = parts.filter((part) => !looksLikeOpenId(part));
    if (invalid.length > 0) {
      await params.prompter.note(
        `Invalid format (must start with ou_): ${invalid.join(", ")}`,
        "Feishu allowlist",
      );
      continue;
    }

    const unique = [
      ...new Set([...existing.map((v) => String(v).trim()).filter(Boolean), ...parts]),
    ];
    return setFeishuAllowFrom(params.cfg, unique);
  }
}

async function noteFeishuCredentialHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Create a Feishu app at https://open.feishu.cn/app",
      "2) Get App ID and App Secret from app credentials",
      "3) Enable bot capability and configure event subscriptions",
      "4) For WebSocket: enable long connection in app settings",
      "5) For Webhook: set event callback URL",
      "Tip: you can also set FEISHU_APP_ID / FEISHU_APP_SECRET env vars.",
      `Docs: ${formatDocsLink("/channels/feishu", "feishu")}`,
    ].join("\n"),
    "Feishu credentials",
  );
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Feishu",
  channel,
  policyKey: "channels.feishu.dmPolicy",
  allowFromKey: "channels.feishu.allowFrom",
  getCurrent: (cfg) => cfg.channels?.feishu?.dmPolicy ?? "pairing",
  setPolicy: (cfg, policy) => setFeishuDmPolicy(cfg, policy),
  promptAllowFrom: promptFeishuAllowFrom,
};

export const feishuOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = Boolean(resolveFeishuCredentials(cfg.channels?.feishu));
    return {
      channel,
      configured,
      statusLines: [`Feishu: ${configured ? "configured" : "needs app credentials"}`],
      selectionHint: configured ? "configured" : "needs app creds",
      quickstartScore: configured ? 2 : 0,
    };
  },
  configure: async ({ cfg, prompter }) => {
    const resolved = resolveFeishuCredentials(cfg.channels?.feishu);
    const hasConfigCreds = Boolean(
      cfg.channels?.feishu?.appId?.trim() && cfg.channels?.feishu?.appSecret?.trim(),
    );
    const canUseEnv = Boolean(
      !hasConfigCreds && process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim(),
    );

    let next = cfg;
    let appId: string | null = null;
    let appSecret: string | null = null;

    if (!resolved) {
      await noteFeishuCredentialHelp(prompter);
    }

    if (canUseEnv) {
      const keepEnv = await prompter.confirm({
        message: "FEISHU_APP_ID + FEISHU_APP_SECRET detected. Use env vars?",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: { ...next.channels?.feishu, enabled: true },
          },
        };
      } else {
        appId = String(
          await prompter.text({
            message: "Enter Feishu App ID",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "Enter Feishu App Secret",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else if (hasConfigCreds) {
      const keep = await prompter.confirm({
        message: "Feishu credentials already configured. Keep them?",
        initialValue: true,
      });
      if (!keep) {
        appId = String(
          await prompter.text({
            message: "Enter Feishu App ID",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "Enter Feishu App Secret",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else {
      appId = String(
        await prompter.text({
          message: "Enter Feishu App ID",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
      appSecret = String(
        await prompter.text({
          message: "Enter Feishu App Secret",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (appId && appSecret) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            enabled: true,
            appId,
            appSecret,
          },
        },
      };
    }

    // Ask for connection mode
    const currentMode = next.channels?.feishu?.mode ?? "websocket";
    const mode = await prompter.select({
      message: "Connection mode",
      options: [
        { value: "websocket", label: "WebSocket (recommended, no public URL needed)" },
        { value: "webhook", label: "Webhook (requires public URL)" },
      ],
      initialValue: currentMode,
    });

    next = {
      ...next,
      channels: {
        ...next.channels,
        feishu: {
          ...next.channels?.feishu,
          mode: mode as "websocket" | "webhook",
        },
      },
    };

    // If webhook mode, ask for port
    if (mode === "webhook") {
      const port = await prompter.text({
        message: "Webhook port",
        placeholder: "3000",
        initialValue: String(next.channels?.feishu?.webhook?.port ?? 3000),
        validate: (value) => {
          const num = parseInt(value ?? "", 10);
          return Number.isNaN(num) || num < 1 || num > 65535
            ? "Must be a valid port number"
            : undefined;
        },
      });
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            webhook: {
              ...next.channels?.feishu?.webhook,
              port: parseInt(String(port), 10),
            },
          },
        },
      };
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },
  dmPolicy,
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: { ...cfg.channels?.feishu, enabled: false },
    },
  }),
};
