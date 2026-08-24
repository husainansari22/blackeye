import { NextRequest } from "next/server";
import { z } from "zod";
import { runAgent, type ChatMessage } from "@/lib/agent/run-agent";

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
});

export async function POST(request: NextRequest) {
  let messages: ChatMessage[];

  try {
    const body = bodySchema.parse(await request.json());
    messages = body.messages;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await runAgent(messages, send);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent error";
        send({ type: "error", content: message });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
