import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { getProvider, isProviderId, listProviderDefinitions, type ProviderDefinition } from "@/server/ai/registry";
import type { AIModel, AIProviderId, ProviderStatus } from "@/server/ai/types";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";

export const providerConfigurationSchema = z.object({
  timeoutMs: z.coerce.number().int().min(5_000).max(600_000).optional(),
});
export type ProviderConfiguration = z.infer<typeof providerConfigurationSchema>;

export interface ProviderSetting {
  providerId: AIProviderId;
  modelId: string;
  isDefault: boolean;
  configuration: ProviderConfiguration;
  updatedAt: Date;
}

export interface AISettingsView {
  definitions: ProviderDefinition[];
  settings: ProviderSetting[];
  defaultProviderId: AIProviderId | null;
  defaultModelId: string | null;
}

export async function getAISettings(ownerId: string): Promise<AISettingsView> {
  const rows = await prisma.aIProviderConfiguration.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } });
  const settings: ProviderSetting[] = rows
    .filter((row) => isProviderId(row.providerId))
    .map((row) => ({
      providerId: row.providerId as AIProviderId,
      modelId: row.modelId,
      isDefault: row.isDefault,
      configuration: providerConfigurationSchema.catch({}).parse(row.configuration ?? {}),
      updatedAt: row.updatedAt,
    }));
  const defaultSetting = settings.find((setting) => setting.isDefault) ?? null;
  return {
    definitions: listProviderDefinitions(),
    settings,
    defaultProviderId: defaultSetting?.providerId ?? null,
    defaultModelId: defaultSetting?.modelId ?? null,
  };
}

export async function saveProviderSetting(
  ownerId: string,
  input: { providerId: string; modelId: string; makeDefault: boolean; configuration?: ProviderConfiguration },
): Promise<void> {
  if (!isProviderId(input.providerId) || !listProviderDefinitions().some((d) => d.id === input.providerId)) {
    throw new AppError("invalid_provider", "Unknown AI provider.");
  }
  const modelId = input.modelId.trim();
  if (!modelId) throw new AppError("invalid_model", "Select or enter a model identifier.");
  const configuration = providerConfigurationSchema.parse(input.configuration ?? {});
  await prisma.$transaction(async (tx) => {
    if (input.makeDefault) {
      await tx.aIProviderConfiguration.updateMany({ where: { ownerId, isDefault: true }, data: { isDefault: false } });
    }
    await tx.aIProviderConfiguration.upsert({
      where: { ownerId_providerId: { ownerId, providerId: input.providerId } },
      update: { modelId, isDefault: input.makeDefault, configuration: toJson(configuration) },
      create: {
        ownerId,
        providerId: input.providerId,
        modelId,
        isDefault: input.makeDefault,
        configuration: toJson(configuration),
      },
    });
  });
}

/** Resolve which provider/model to use, honouring explicit overrides and saved defaults. Never falls back silently to a different provider. */
export async function resolveProviderSelection(
  ownerId: string,
  override?: { providerId?: string | null; modelId?: string | null },
): Promise<{ providerId: AIProviderId; modelId: string; paid: boolean }> {
  const settings = await getAISettings(ownerId);
  const providerId = override?.providerId?.trim() || settings.defaultProviderId;
  if (!providerId || !isProviderId(providerId)) {
    throw new AppError(
      "no_provider",
      "No AI provider is configured. Choose a default provider and model in AI Settings.",
    );
  }
  const saved = settings.settings.find((setting) => setting.providerId === providerId);
  const modelId = override?.modelId?.trim() || saved?.modelId;
  if (!modelId) {
    throw new AppError("no_model", `No model is configured for ${providerId}. Choose a model in AI Settings.`);
  }
  const definition = settings.definitions.find((d) => d.id === providerId);
  if (!definition) throw new AppError("invalid_provider", "The selected AI provider is not enabled on this server.");
  if (!definition.configured)
    throw new AppError(
      "provider_not_configured",
      `${definition.displayName} is not configured: ${definition.configurationHint}`,
    );
  return { providerId, modelId, paid: definition.paid };
}

export async function checkProviderConnection(providerId: string): Promise<ProviderStatus> {
  return getProvider(providerId).checkConnection();
}

export async function listProviderModels(providerId: string): Promise<AIModel[]> {
  return getProvider(providerId).listModels();
}
