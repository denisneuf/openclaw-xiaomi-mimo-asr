# openclaw-xiaomi-mimo-asr

Speech recognition (ASR) plugin for [OpenClaw](https://openclaw.ai) using the
Xiaomi MiMo v2.5 ASR model.

## Prerequisites

- A [Xiaomi MiMo](https://mimo.mi.com) API key
- Set the `XIAOMI_API_KEY` environment variable (e.g. in `~/.openclaw/.env`)
- `ffmpeg` installed and on `$PATH` (required for audio format conversion)

## Supported models

- `mimo-v2.5-asr` (default)

## Installation

```bash
openclaw plugins install git:github.com/denisneuf/openclaw-xiaomi-mimo-asr
```

## Upgrading

```bash
openclaw plugins remove xiaomi-mimo-asr --keep-config
openclaw plugins install git:github.com/denisneuf/openclaw-xiaomi-mimo-asr
```

If the plugin was installed with `--link`:

```bash
cd ~/.openclaw/plugins/xiaomi-mimo-asr
git pull origin main
```

Then restart the gateway:

```bash
openclaw gateway restart
```

## Uninstalling

```bash
openclaw plugins remove xiaomi-mimo-asr
```

## How it works

The plugin registers a `MediaUnderstandingProvider` with `capabilities: ["audio"]`.
When audio is attached to a message, OpenClaw routes it to this provider for
transcription.

### Format conversion (v2.0.0+)

Audio formats that MiMo does not natively handle are automatically converted to
PCM WAV (16 kHz, mono) using `ffmpeg` before being sent to the API.

**Native formats** (sent directly):
- `audio/wav`, `audio/wave`, `audio/x-wav`
- `audio/mpeg`, `audio/mp3`

**Converted formats** (auto-converted via ffmpeg):
- `audio/x-caf` — Apple Core Audio Format (used by iMessage voice memos)
- `audio/opus`, `audio/ogg`
- `audio/flac`
- `audio/aac`, `audio/x-aac`
- `audio/m4a`, `audio/x-m4a`, `audio/mp4`
- `audio/amr`

### Language selection

MiMo ASR supports three language modes via the `language` parameter:

| Value | Behaviour |
|-------|-----------|
| `auto` | Automatic language detection (default) |
| `zh` | Chinese — improves accuracy for Mandarin/dialects |
| `en` | English |

> **⚠️ Only `zh`, `en`, and `auto` are supported.** Spanish, French, Japanese,
> and other languages are **not** handled by this model. With `auto` on non-zh/en
> audio, the model returns garbled output.

## API reference

The plugin exposes a single provider:

- **Provider ID:** `xiaomi-mimo-asr`
- **Capabilities:** `["audio"]`
- **Endpoint:** `POST https://api.xiaomimimo.com/v1/chat/completions`
- **Auth header:** `api-key` (not `Authorization: Bearer`)
- **Timeout:** 120 seconds (configurable via `req.timeoutMs`)

## License

MIT
