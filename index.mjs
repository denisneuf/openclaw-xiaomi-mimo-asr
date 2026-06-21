import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const PROVIDER_ID = "xiaomi-mimo-asr";
const DEFAULT_MODEL = "mimo-v2.5-asr";
const BASE_URL = "https://api.xiaomimimo.com/v1";
const ENV_KEY = "XIAOMI_API_KEY";

export default definePluginEntry({
  id: PROVIDER_ID,
  name: "Xiaomi MiMo ASR",
  description: "Speech recognition via Xiaomi MiMo v2.5 ASR model",
  register(api) {
    api.registerMediaUnderstandingProvider({
      id: PROVIDER_ID,
      capabilities: ["audio"],
      defaultModels: { audio: DEFAULT_MODEL },
      autoPriority: { audio: 50 },

      resolveAuth: () => {
        const apiKey = process.env[ENV_KEY];
        if (!apiKey) return null;
        return {
          kind: "api-key",
          apiKey,
          source: ENV_KEY,
        };
      },

      async transcribeAudio(req) {
        const apiKey =
          req.auth?.kind === "api-key"
            ? req.auth.apiKey
            : req.apiKey || process.env[ENV_KEY];

        if (!apiKey) {
          throw new Error(
            `MiMo ASR: API key missing. Set ${ENV_KEY} environment variable or provide apiKey in request.`
          );
        }

        // Convert audio buffer to base64 data URL
        const mime = req.mime || "audio/wav";
        const base64 = req.buffer.toString("base64");
        const dataUrl = `data:${mime};base64,${base64}`;

        const body = {
          model: req.model || DEFAULT_MODEL,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "input_audio",
                  input_audio: {
                    data: dataUrl,
                  },
                },
              ],
            },
          ],
          max_completion_tokens: 4096,
        };

        // Add language hint if provided
        if (req.language) {
          body.asr_options = { language: req.language };
        }

        const baseUrl = (req.baseUrl || BASE_URL).replace(/\/+$/, "");
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(req.timeoutMs || 120_000),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `MiMo ASR transcription failed (${response.status}): ${text}`
          );
        }

        const json = await response.json();

        // Extract text from OpenAI-compatible response
        const text =
          json?.choices?.[0]?.message?.content ||
          json?.choices?.[0]?.message?.reasoning_content ||
          "";

        if (!text) {
          throw new Error(
            "MiMo ASR response missing transcription text in choices[0].message"
          );
        }

        return { text, model: json.model || DEFAULT_MODEL };
      },
    });
  },
});
