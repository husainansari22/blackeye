export const config = {
  accessCode: process.env.ACCESS_CODE ?? "change-me",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
  llmProvider: (process.env.LLM_PROVIDER ?? "openai") as "openai" | "anthropic",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
  workspacePath: process.env.WORKSPACE_PATH ?? process.cwd(),
  maxAgentIterations: 20,
};

export function assertLlmConfigured() {
  if (config.llmProvider === "openai" && !config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }
  if (config.llmProvider === "anthropic" && !config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic");
  }
}
