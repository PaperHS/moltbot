import type { ChannelPlugin } from "openclaw/plugin-sdk";

// TODO: Implement proper channel interface when needed
// For now, this is a minimal stub to satisfy the channel registry
export const officeChannel: ChannelPlugin = {
  id: "office",
  meta: {
    id: "office",
    label: "Claw Office",
    selectionLabel: "Claw Office",
    blurb: "Integration with WorkAdventure Office environment",
    docsPath: "https://docs.openclaw.ai/channels/office",
    systemImage: "building_2",
  },
  capabilities: {
    chatTypes: ["group", "direct"],
    nativeCommands: true,
  },
  groups: {
    resolveRequireMention: () => false,
  },
  messaging: {
    targetResolver: {
        looksLikeId: (raw) => raw.startsWith("group_") || raw.startsWith("bot_"),
        hint: "Use 'group_all' for broadcast or 'bot_<id>' for direct message"
    }
  },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: () => ({}),
    isEnabled: () => true,
    isConfigured: () => true,
    defaultAccountId: () => "default",
    unconfiguredReason: () => "Not configured",
    disabledReason: () => "Disabled",
    describeAccount: () => ({
        accountId: "default",
        configured: true,
        enabled: true,
        running: true
    })
  }
};
