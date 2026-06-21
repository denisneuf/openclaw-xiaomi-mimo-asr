import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PROVIDER_ID = "xiaomi-mimo-asr";
const DEFAULT_MODEL = "mimo-v2.5-asr";
const BASE_URL = "https://api.xiaomimimo.com/v1";
const ENV_KEY = "XIAOMI_API_KEY";

// MIME types that MiMo can handle directly
const MIMO_NATIVE_FORMATS = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
]);

// MIME types that need conversion to WAV before sending to MiMo
const CONVERTIBLE_FORMATS = new Set([
  "audio/x-caf",
  "audio/x-caf",
  "audio/opus",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/x-aac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/amr",
  "audio/x-amr",
]);

/**
 * Convert an audio buffer to PCM WAV (16kHz, mono) using ffmpeg.
 * Returns { buffer, mime } on success, or throws.
 */
async function convertToWav(inputBuffer, sourceMime) {
  const extMap = {
    "audio/x-caf": ".caf",
    "audio/opus": ".opus",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
    "audio/aac": ".aac",
    "audio/x-aac": ".aac",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/amr": ".amr",
    "audio/x-amr": ".amr",
  };
  const inExt = extMap[sourceMime] || ".bin";
  const tag = randomUUID().slice(0, 8);
  const inPath = join(tmpdir(), `mimo-cvt-${tag}${inExt}`);
  const outPath = join(tmpdir(), `mimo-cvt-${tag}.wav`);

  await writeFile(inPath, inputBuffer);

  try {
    await new Promise((resolve, reject) => {
      execFile(
        "ffmpeg",
        [
          "-y",
          "-i", inPath,
          "-acodec", "pcm_s16le",
          "-ar", "16000",
          "-ac", "1",
          outPath,
        ],
        { timeout: 30_000 },
        (err, stdout, stderr) => {
          if (err) {
            // ffmpeg writes diagnostics to stderr even on success
            const msg = (stderr || "").split("\n").slice(-5).join("; ");
            reject(new Error(`ffmpeg conversion failed: ${err.message} — ${msg}`));
          } else {
            resolve();
          }
        }
      );
    });

    const wavBuffer = await readFile(outPath);
    return { buffer: wavBuffer, mime: "audio/wav" };
  } finally {
    // Best-effort cleanup of temp files
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

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

        // Resolve audio buffer — may need format conversion
        let mime = req.mime || "audio/wav";
        let buffer = req.buffer;

        // Normalise MIME to lowercase for matching
        const normMime = mime.toLowerCase();

        if (!MIMO_NATIVE_FORMATS.has(normMime)) {
          if (CONVERTIBLE_FORMATS.has(normMime)) {
            // Convert non-native format to WAV
            const converted = await convertToWav(buffer, normMime);
            buffer = converted.buffer;
            mime = converted.mime;
          } else {
            // Unknown format — try sending as-is (the API will reject it if unsupported)
            console.warn(
              `[xiaomi-mimo-asr] unknown audio MIME "${mime}", sending raw (likely to fail)`
            );
          }
        }

        // Encode as base64 data URL
        const base64 = buffer.toString("base64");
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
