import type { ModelOption } from "./types.js";

export const DEFAULT_MODEL_ID = "deepseek/deepseek-v4-flash";

export const MODEL_CATALOG: readonly ModelOption[] = [
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    premium: true,
    limitedOk: false,
    enabled: true,
    notes: "Full-tier premium pool",
  },
  {
    id: DEFAULT_MODEL_ID,
    label: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    premium: false,
    limitedOk: true,
    enabled: true,
    notes: "Limited-tier default; unlimited on full CLI",
  },
  {
    id: "xiaomi/mimo-v2.5",
    label: "MiMo 2.5",
    provider: "Xiaomi",
    premium: false,
    limitedOk: true,
    enabled: true,
    notes: "Limited-tier multimodal",
  },
  {
    id: "minimax/minimax-m3",
    label: "MiniMax M3",
    provider: "MiniMax",
    premium: true,
    limitedOk: false,
    enabled: true,
  },
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "OpenAI",
    premium: true,
    limitedOk: false,
    enabled: true,
  },
  {
    id: "z-ai/glm-5.2",
    label: "GLM 5.2",
    provider: "Z.ai",
    premium: true,
    limitedOk: false,
    enabled: false,
    notes: "Referral pool, not the shared premium 6",
  },
] as const;

export function findModel(id: string): ModelOption | undefined {
  return MODEL_CATALOG.find((model) => model.id === id);
}

export function enabledModels(models: readonly ModelOption[]): readonly ModelOption[] {
  return models.filter((model) => model.enabled);
}

export function publicModelObject(model: ModelOption): {
  readonly id: string;
  readonly object: "model";
  readonly owned_by: string;
} {
  return { id: model.id, object: "model", owned_by: model.provider };
}
