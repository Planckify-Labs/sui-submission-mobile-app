import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, UIMessage } from "ai";

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "API key not configured. Please set ANTHROPIC_API_KEY in your environment.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = streamText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: convertToModelMessages(messages),
      maxRetries: 2,
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "none",
      },
    });
  } catch (error: any) {
    console.error("Chat API error:", error);

    // Handle specific Anthropic errors
    if (
      error?.message?.includes("overloaded") ||
      error?.type === "overloaded_error"
    ) {
      return new Response(
        JSON.stringify({
          error:
            "The AI service is currently experiencing high demand. Please try again in a moment.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        error:
          error?.message || "An unexpected error occurred. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
