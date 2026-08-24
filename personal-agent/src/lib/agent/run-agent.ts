import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { config, assertLlmConfigured } from "../config";
import { toolDefinitions, executeTool, type ToolName } from "./tools";
import { systemPromptTemplate } from "./system-prompt";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
}

function getSystemPrompt(): string {
  return systemPromptTemplate.replace("{{WORKSPACE_PATH}}", config.workspacePath);
}

const openaiTools = toolDefinitions.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

async function runOpenAI(
  messages: ChatMessage[],
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt() },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < config.maxAgentIterations; i++) {
    const response = await client.chat.completions.create({
      model: config.openaiModel,
      messages: history,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const msg = choice.message;
    history.push(msg);

    if (msg.content) {
      onEvent({ type: "text", content: msg.content });
    }

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      onEvent({ type: "done" });
      return;
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;

      const name = call.function.name as ToolName;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      onEvent({ type: "tool_call", tool: name, args });
      const result = await executeTool(name, args);
      onEvent({ type: "tool_result", tool: name, result });

      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  onEvent({ type: "error", content: "Agent reached maximum iteration limit." });
  onEvent({ type: "done" });
}

async function runAnthropic(
  messages: ChatMessage[],
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const anthropicTools = toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool["input_schema"],
  }));

  type AnthropicMessage = Anthropic.MessageParam;
  const history: AnthropicMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let i = 0; i < config.maxAgentIterations; i++) {
    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 8192,
      system: getSystemPrompt(),
      tools: anthropicTools,
      messages: history,
    });

    const textBlocks = response.content.filter((b) => b.type === "text");
    for (const block of textBlocks) {
      if (block.type === "text" && block.text) {
        onEvent({ type: "text", content: block.text });
      }
    }

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    if (!toolUseBlocks.length) {
      history.push({ role: "assistant", content: response.content });
      onEvent({ type: "done" });
      return;
    }

    history.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      const name = block.name as ToolName;
      const args = (block.input ?? {}) as Record<string, unknown>;

      onEvent({ type: "tool_call", tool: name, args });
      const result = await executeTool(name, args);
      onEvent({ type: "tool_result", tool: name, result });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    history.push({ role: "user", content: toolResults });
  }

  onEvent({ type: "error", content: "Agent reached maximum iteration limit." });
  onEvent({ type: "done" });
}

export async function runAgent(
  messages: ChatMessage[],
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  assertLlmConfigured();

  if (config.llmProvider === "anthropic") {
    await runAnthropic(messages, onEvent);
  } else {
    await runOpenAI(messages, onEvent);
  }
}
