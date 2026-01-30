import type { Api, Model } from "@mariozechner/pi-ai";
import { discoverAuthStorage, discoverModels } from "@mariozechner/pi-coding-agent";

import type { OpenClawConfig } from "../../config/config.js";
import type { ModelDefinitionConfig } from "../../config/types.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
import { DEFAULT_CONTEXT_TOKENS } from "../defaults.js";
import { normalizeModelCompat } from "../model-compat.js";
import { normalizeProviderId } from "../model-selection.js";

type InlineModelEntry = ModelDefinitionConfig & { provider: string; baseUrl?: string };
type InlineProviderConfig = {
  baseUrl?: string;
  api?: ModelDefinitionConfig["api"];
  models?: ModelDefinitionConfig[];
};

export function buildInlineProviderModels(
  providers: Record<string, InlineProviderConfig>,
): InlineModelEntry[] {
  return Object.entries(providers).flatMap(([providerId, entry]) => {
    const trimmed = providerId.trim();
    if (!trimmed) return [];
    return (entry?.models ?? []).map((model) => ({
      ...model,
      provider: trimmed,
      baseUrl: entry?.baseUrl,
      api: model.api ?? entry?.api,
    }));
  });
}

export function buildModelAliasLines(cfg?: OpenClawConfig) {
  const models = cfg?.agents?.defaults?.models ?? {};
  const entries: Array<{ alias: string; model: string }> = [];
  for (const [keyRaw, entryRaw] of Object.entries(models)) {
    const model = String(keyRaw ?? "").trim();
    if (!model) continue;
    const alias = String((entryRaw as { alias?: string } | undefined)?.alias ?? "").trim();
    if (!alias) continue;
    entries.push({ alias, model });
  }
  return entries
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .map((entry) => `- ${entry.alias}: ${entry.model}`);
}

// Map provider id to environment variable names for base URL override.
const PROVIDER_BASE_URL_ENV_MAP: Record<string, string[]> = {
  google: ["GEMINI_BASE_URL", "CLAWDBOT_GEMINI_BASE_URL"],
  "google-gemini-cli": ["GEMINI_CLI_BASE_URL", "CLAWDBOT_GEMINI_CLI_BASE_URL"],
  "google-antigravity": ["ANTIGRAVITY_BASE_URL", "CLAWDBOT_ANTIGRAVITY_BASE_URL"],
};

function resolveProviderBaseUrlFromEnv(provider: string): string | undefined {
  const envVars = PROVIDER_BASE_URL_ENV_MAP[provider];
  if (!envVars) return undefined;
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim();
    if (value) return value;
  }
  return undefined;
}

function applyProviderBaseUrlOverride(
  model: Model<Api>,
  cfg: OpenClawConfig | undefined,
): Model<Api> {
  // Priority: env var > config > built-in
  const envBaseUrl = resolveProviderBaseUrlFromEnv(model.provider);
  if (envBaseUrl && envBaseUrl !== model.baseUrl) {
    return { ...model, baseUrl: envBaseUrl };
  }
  const providers = cfg?.models?.providers ?? {};
  const providerCfg = providers[model.provider];
  const customBaseUrl = providerCfg?.baseUrl?.trim();
  if (!customBaseUrl || customBaseUrl === model.baseUrl) return model;
  return { ...model, baseUrl: customBaseUrl };
}

export function resolveModel(
  provider: string,
  modelId: string,
  agentDir?: string,
  cfg?: OpenClawConfig,
): {
  model?: Model<Api>;
  error?: string;
  authStorage: ReturnType<typeof discoverAuthStorage>;
  modelRegistry: ReturnType<typeof discoverModels>;
} {
  const resolvedAgentDir = agentDir ?? resolveOpenClawAgentDir();
  const authStorage = discoverAuthStorage(resolvedAgentDir);
  const modelRegistry = discoverModels(authStorage, resolvedAgentDir);
  const model = modelRegistry.find(provider, modelId) as Model<Api> | null;
  if (!model) {
    const providers = cfg?.models?.providers ?? {};
    const inlineModels = buildInlineProviderModels(providers);
    const normalizedProvider = normalizeProviderId(provider);
    const inlineMatch = inlineModels.find(
      (entry) => normalizeProviderId(entry.provider) === normalizedProvider && entry.id === modelId,
    );
    if (inlineMatch) {
      const normalized = normalizeModelCompat(inlineMatch as Model<Api>);
      return {
        model: normalized,
        authStorage,
        modelRegistry,
      };
    }
    const providerCfg = providers[provider];
    if (providerCfg || modelId.startsWith("mock-")) {
      const fallbackModel: Model<Api> = normalizeModelCompat({
        id: modelId,
        name: modelId,
        api: providerCfg?.api ?? "openai-responses",
        provider,
        baseUrl: providerCfg?.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: providerCfg?.models?.[0]?.contextWindow ?? DEFAULT_CONTEXT_TOKENS,
        maxTokens: providerCfg?.models?.[0]?.maxTokens ?? DEFAULT_CONTEXT_TOKENS,
      } as Model<Api>);
      return { model: fallbackModel, authStorage, modelRegistry };
    }
    return {
      error: `Unknown model: ${provider}/${modelId}`,
      authStorage,
      modelRegistry,
    };
  }
  // Apply custom baseUrl override from config if configured for this provider.
  const overridden = applyProviderBaseUrlOverride(model, cfg);
  return { model: normalizeModelCompat(overridden), authStorage, modelRegistry };
}
