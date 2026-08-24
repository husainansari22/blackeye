"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
}

interface ToolEvent {
  type: "tool_call" | "tool_result";
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
}

interface AgentEvent {
  type: string;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export function ChatInterface() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    const assistantId = uid();
    let assistantContent = "";
    const toolEvents: ToolEvent[] = [];

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", toolEvents: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as AgentEvent;

          if (event.type === "text" && event.content) {
            assistantContent += event.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantContent, toolEvents: [...toolEvents] }
                  : m,
              ),
            );
          }

          if (event.type === "tool_call" && event.tool) {
            toolEvents.push({
              type: "tool_call",
              tool: event.tool,
              args: event.args,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantContent, toolEvents: [...toolEvents] }
                  : m,
              ),
            );
          }

          if (event.type === "tool_result" && event.tool) {
            toolEvents.push({
              type: "tool_result",
              tool: event.tool,
              result: event.result,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantContent, toolEvents: [...toolEvents] }
                  : m,
              ),
            );
          }

          if (event.type === "error" && event.content) {
            assistantContent += `\n\n**Error:** ${event.content}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assistantContent } : m,
              ),
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Failed: ${message}` }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Personal Agent</h1>
          <p className="text-xs text-zinc-500">Your private AI coding assistant</p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
        >
          Lock
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
              <h2 className="mb-2 text-xl font-medium">What should we build?</h2>
              <p className="text-sm text-zinc-400">
                Ask me to write code, fix bugs, run commands, or explore your workspace.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-violet-600 text-white"
                    : "border border-zinc-800 bg-zinc-900"
                }`}
              >
                {msg.toolEvents && msg.toolEvents.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {msg.toolEvents.map((ev, i) => (
                      <details
                        key={i}
                        className="rounded-lg border border-zinc-700 bg-zinc-950/50 text-xs"
                      >
                        <summary className="cursor-pointer px-3 py-2 font-mono text-zinc-400">
                          {ev.type === "tool_call"
                            ? `▶ ${ev.tool}(${JSON.stringify(ev.args ?? {})})`
                            : `← ${ev.tool} result`}
                        </summary>
                        {ev.result && (
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-2 text-zinc-500">
                            {ev.result}
                          </pre>
                        )}
                      </details>
                    ))}
                  </div>
                )}
                {msg.content ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  streaming && msg.role === "assistant" && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                      Working...
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your agent to build something..."
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
