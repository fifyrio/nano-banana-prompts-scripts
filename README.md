# nano-banana-prompts-scripts

A helper script for generating `prompts-<lang>.json` files from the [YouMind-OpenLab/awesome-nano-banana-pro-prompts](https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts) README.

## Usage

The generator reads the upstream README and emits one JSON file per language. Each JSON file follows the structure:

```json
[
  {
    "author": "",
    "authorUrl": "",
    "category": "",
    "id": 1,
    "imageUrl": "...",
    "prompt": "...",
    "tags": [],
    "title": "",
    "description": ""
  }
]
```

### Run with the sample README

A sample README is provided under `samples/README.sample.md` to illustrate the expected Markdown format and to validate the parser locally. The generator is written in TypeScript (see `scripts/generate_prompts_json.ts`) and ships with a precompiled Node.js entrypoint:

```bash
node scripts/generate_prompts_json.js --readme samples/README.sample.md --output-dir outputs
```

After running, you will find files such as `outputs/prompts-en.json` and `outputs/prompts-zh.json`.

### Generate tags for English prompts

Use the OpenRouter-powered tagger to summarize tags from the English prompt JSON. Set your `OPENROUTER_API_KEY` and run:

```bash
OPENROUTER_API_KEY=YOUR_KEY \
node scripts/generate_prompt_tags.js --input outputs/prompts-en.json --output outputs/prompts-en.json
```

Flags:

- `--input` / `-i`: Path to the source prompt JSON (defaults to `outputs/prompts-en.json`).
- `--output` / `-o`: Destination path for the updated JSON (defaults to the same as `--input`).
- `--model` / `-m`: Override the OpenRouter model (defaults to `openai/gpt-5-mini`).
- `--dry-run`: Fetch and print tags without writing the output file.

### Run against the upstream README

When outbound network access is available, omit the `--readme` argument to fetch the upstream README directly:

```bash
node scripts/generate_prompts_json.js --output-dir outputs
```

If you need a different URL or mirror, pass it through `--source-url`.
