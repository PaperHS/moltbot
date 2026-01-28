import { z } from "zod";

const FeishuModeSchema = z.enum(["websocket", "webhook"]).optional().default("websocket");

const FeishuWebhookConfigSchema = z
  .object({
    port: z.number().int().positive().optional(),
    path: z.string().optional(),
  })
  .strict()
  .optional();

const FeishuDmPolicySchema = z.enum(["pairing", "open", "disabled"]).optional().default("pairing");

const FeishuGroupPolicySchema = z.enum(["allowlist", "open"]).optional().default("allowlist");

export const FeishuConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    mode: FeishuModeSchema,
    webhook: FeishuWebhookConfigSchema,
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    dmPolicy: FeishuDmPolicySchema,
    allowFrom: z.array(z.string()).optional(),
    groupPolicy: FeishuGroupPolicySchema,
    groupAllowFrom: z.array(z.string()).optional(),
    requireMention: z.boolean().optional().default(true),
    textChunkLimit: z.number().int().positive().optional(),
    mediaMaxMb: z.number().positive().optional(),
  })
  .strict();

export type FeishuConfigInput = z.input<typeof FeishuConfigSchema>;
export type FeishuConfigOutput = z.output<typeof FeishuConfigSchema>;
