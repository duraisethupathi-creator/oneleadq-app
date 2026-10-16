const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODELS = [
  "gemini-3.5-flash-lite",
];

const MAX_ATTEMPTS = 3;

// One Gemini request cannot block the app forever.
const REQUEST_TIMEOUT_MS = 30000;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error) {
  const status = error?.status;
  const message = String(error?.message || "");

  return (
    status === 503 ||
    status === 429 ||
    status === 404 ||
    status === 408 ||
    error?.code === "GEMINI_TIMEOUT" ||
    message.includes("503") ||
    message.includes("429") ||
    message.includes("408") ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand") ||
    message.includes("timed out")
  );
}

function generateWithTimeout(model, contents) {
  let timer;

  const requestPromise = ai.models.generateContent({
    model,
    contents,
  });

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Gemini request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`
      );

      error.status = 408;
      error.code = "GEMINI_TIMEOUT";

      reject(error);
    }, REQUEST_TIMEOUT_MS);
  });

  return Promise.race([
    requestPromise,
    timeoutPromise,
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

async function generateWithFallback(contents) {
  let lastError;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(
          `AI: ${model} | attempt ${attempt}/${MAX_ATTEMPTS}`
        );

        const response = await generateWithTimeout(
          model,
          contents
        );

        console.log(`SUCCESS: ${model}`);

        return {
          response,
          model,
        };
      } catch (error) {
        lastError = error;

        console.log(
          `FAILED: ${model} | attempt ${attempt}/${MAX_ATTEMPTS} | status: ${
            error?.status || "unknown"
          }${
            error?.code === "GEMINI_TIMEOUT"
              ? " | TIMEOUT"
              : ""
          }`
        );

        if (!isRetryable(error)) {
          throw error;
        }

        if (attempt < MAX_ATTEMPTS) {
          // Exponential backoff:
          // attempt 1 -> ~2 sec
          // attempt 2 -> ~4 sec
          const baseDelay =
            2000 * Math.pow(2, attempt - 1);

          const jitter =
            Math.floor(Math.random() * 1000);

          const waitTime =
            baseDelay + jitter;

          console.log(
            `Temporary Gemini error. Retrying in ${Math.round(
              waitTime / 1000
            )} seconds...`
          );

          await sleep(waitTime);
        }
      }
    }

    console.log(
      `${model} unavailable. Switching to next model...`
    );

    await sleep(2000);
  }

  const finalError = new Error(
    "Gemini is temporarily busy. Please try again in a few minutes."
  );

  finalError.status =
    lastError?.status || 503;

  finalError.code =
    lastError?.code || "GEMINI_UNAVAILABLE";

  throw finalError;
}

module.exports = {
  generateWithFallback,
};