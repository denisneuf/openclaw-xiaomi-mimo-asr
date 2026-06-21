# openclaw-xiaomi-mimo-asr

Speech recognition (ASR) plugin for [OpenClaw](https://openclaw.ai) using the Xiaomi MiMo v2.5 ASR model.

## Prerequisites

- A [Xiaomi MiMo API](https://mimo.mi.com) key
- Set the `XIAOMI_API_KEY` environment variable (e.g. in `~/.openclaw/.env`)

## Supported models

- `mimo-v2.5-asr` (default)

## Installation

```bash
openclaw plugins install git:github.com/denisneuf/openclaw-xiaomi-mimo-asr
```

## API

The plugin registers a `MediaUnderstandingProvider` with `capabilities: ["audio"]`.

When audio is attached to a message, OpenClaw automatically routes it to this
provider for transcription.

### Supported audio formats

- `audio/wav`
- `audio/mpeg` (mp3)

### Language selection

MiMo ASR supports language auto-detection by default. You can also specify:

- `auto` — automatic detection
- `zh` — Chinese (improves accuracy for Chinese/dialects)
- `en` — English

## License

MIT
