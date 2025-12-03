#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_MODEL = "openai/gpt-5-mini";
const DEFAULT_INPUT = path.resolve(process.cwd(), "outputs/prompts-en.json");
const DEFAULT_OUTPUT = DEFAULT_INPUT;

function parseArgs(argv) {
  const options = {
    inputPath: DEFAULT_INPUT,
    outputPath: DEFAULT_OUTPUT,
    model: DEFAULT_MODEL,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      options.inputPath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (arg === "--output" || arg === "-o") {
      options.outputPath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (arg === "--model" || arg === "-m") {
      options.model = argv[i + 1];
      i += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function readPromptEntries(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${filePath}`);
  }
  return parsed;
}

function writePromptEntries(filePath, entries) {
  const serialized = `${JSON.stringify(entries, null, 2)}\n`;
  fs.writeFileSync(filePath, serialized, "utf-8");
}

function buildTagPrompt(entry) {
  return [
    "You are given a prompt entry from a public prompt list.",
    `Title: ${entry.title}`,
    `Description: ${entry.description}`,
    "Generate between 3 and 8 concise tags that describe the topic or use-case.",
    "Return only a JSON array of lower-case, hyphenated strings with no explanations.",
  ].join("\n");
}

function normalizeTags(content) {
  const fallback = content
    .replace(/[\[\]]/g, "")
    .split(/,|\n|;/)
    .map((part) => part.trim())
    .filter(Boolean);

  const candidates = [];

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (typeof item === "string") {
          candidates.push(item);
        }
      });
    }
  } catch (err) {
    candidates.push(...fallback);
  }

  const cleaned = (candidates.length ? candidates : fallback).map((tag) =>
    tag
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
  );

  const unique = Array.from(new Set(cleaned.filter(Boolean)));
  return unique;
}

function loadApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }
  return apiKey;
}

async function fetchTagsForEntry(entry, openrouter, model) {
  const userPrompt = buildTagPrompt(entry);
  const stream = await openrouter.chat.send({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
          },
        ],
      },
    ],
    stream: true,
  });

  let content = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      content += delta;
    }
  }

  return normalizeTags(content || "");
}

async function loadOpenRouter() {
  const mod = await import("@openrouter/sdk");
  return mod.OpenRouter;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = loadApiKey();
  const OpenRouterCtor = await loadOpenRouter();
  const openrouter = new OpenRouterCtor({ apiKey });

  const entries = readPromptEntries(options.inputPath);
  const updated = [];

  for (const entry of entries) {
    const tags = await fetchTagsForEntry(entry, openrouter, options.model);
    updated.push({ ...entry, tags });
    console.log(`Generated tags for #${entry.id} (${entry.title}): ${tags.join(", ")}`);
  }

  if (options.dryRun) {
    console.log("Dry run enabled; not writing output file.");
    return;
  }

  writePromptEntries(options.outputPath, updated);
  console.log(`Updated prompt entries written to ${options.outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
