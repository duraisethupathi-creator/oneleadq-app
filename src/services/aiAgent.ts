const AI_AGENT_URL = "http://192.168.1.2:3001";

const AI_REQUEST_TIMEOUT = 15000;
const HEALTH_TIMEOUT = 5000;

export type AIClientContext = {
  name: string;
  businessType?: string;
  website?: string;
  location?: string;
  services?: string[];
  notes?: string;
};

export type AIAgentResponse = {
  ok: boolean;
  provider?: string;
  model?: string;
  agent?: string;
  agentId?: string;
  reply?: string;
  error?: string;
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function askOneLeadQAgent(
  message: string,
  clientContext?: AIClientContext
): Promise<AIAgentResponse> {
  const cleanMessage = message.trim();

  if (!cleanMessage) {
    throw new Error("Message is required");
  }

  try {
    const response = await fetchWithTimeout(
      `${AI_AGENT_URL}/ai`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanMessage,
          clientContext,
        }),
      },
      AI_REQUEST_TIMEOUT
    );

    const data: AIAgentResponse =
      await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
          "OneLeadQ AI Agent request failed"
      );
    }

    return data;
  } catch (error) {
    console.error(
      "OneLeadQ AI Agent Error:",
      error
    );

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "OneLeadQ AI is not responding. Please check the AI Agent connection and try again."
      );
    }

    throw new Error(
      "Unable to connect to OneLeadQ AI. Please check that the AI Agent is running and your phone is connected to the same network."
    );
  }
}

export async function checkAIAgentHealth() {
  try {
    const response = await fetchWithTimeout(
      `${AI_AGENT_URL}/health`,
      {},
      HEALTH_TIMEOUT
    );

    const data = await response.json();

    return {
      connected:
        response.ok &&
        data.ok === true,
      ...data,
    };
  } catch (error) {
    return {
      connected: false,
      error:
        error instanceof Error &&
        error.name === "AbortError"
          ? "AI Agent connection timed out"
          : "Unable to connect to AI Agent",
    };
  }
}