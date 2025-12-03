#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const LANG_FALLBACKS = {
  english: "en",
  en: "en",
  chinese: "zh",
  "中文": "zh",
  "简体中文": "zh",
  "traditional chinese": "zh-tw",
  "繁體中文": "zh-tw",
};

const LANG_HINT_RE = /\(([^)]+)\)/;
const TITLE_RE = /^###\s+(.*)/;
const LANG_RE = /^##\s+(.*)/;
const BULLET_RE = /^\s*-\s+([^:]+):\s*(.*)$/;

function slugifyLanguage(title) {
  const hintMatch = LANG_HINT_RE.exec(title);
  if (hintMatch) {
    const hint = hintMatch[1].trim();
    return (
      LANG_FALLBACKS[hint.toLowerCase()] ||
      hint.toLowerCase().replace(/[^a-zA-Z-]/g, "") ||
      hint.toLowerCase()
    );
  }

  const normalized = title.trim().toLowerCase();
  if (LANG_FALLBACKS[normalized]) {
    return LANG_FALLBACKS[normalized];
  }
  return normalized.replace(/[^a-zA-Z-]/g, "");
}

async function readSource(readmePath, sourceUrl) {
  if (readmePath) {
    return fs.readFileSync(readmePath, "utf-8");
  }
  if (!sourceUrl) {
    throw new Error("Either a README file path or source URL must be provided.");
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch README: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

function buildEntry(title, blockLines) {
  const data = { title, prompt: "", description: "" };
  let collectingKey = null;
  let continuation = [];

  const commitContinuation = () => {
    if (collectingKey && continuation.length > 0) {
      const text = continuation.map((line) => line.trim()).join("\n").trim();
      data[collectingKey] = `${data[collectingKey] || ""}\n${text}`.trim();
    }
    collectingKey = null;
    continuation = [];
  };

  for (const line of blockLines) {
    const bulletMatch = BULLET_RE.exec(line);
    if (bulletMatch) {
      commitContinuation();
      const key = bulletMatch[1].trim();
      const value = bulletMatch[2].trim();
      const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
      const mappedKey = { authorurl: "authorUrl", image: "imageUrl" }[normalizedKey] || key;
      const lowerKey = mappedKey.toLowerCase();

      if ((lowerKey === "prompt" || lowerKey === "description") && !value) {
        collectingKey = lowerKey;
        continue;
      }

      data[lowerKey] = value;
      if (lowerKey === "prompt" || lowerKey === "description") {
        collectingKey = lowerKey;
      } else {
        collectingKey = null;
      }
      continue;
    }

    if (collectingKey) {
      continuation.push(line);
    }
  }

  commitContinuation();

  return {
    author: data["author"] || "",
    authorUrl: data["authorurl"] || "",
    category: data["category"] || "",
    id: 0,
    imageUrl: data["imageurl"] || "",
    prompt: data["prompt"] || "",
    tags: [],
    title: data["title"] || "",
    description: data["description"] || "",
  };
}

function parsePrompts(lines) {
  const promptsByLang = {};
  let currentLang = null;
  let currentTitle = null;
  let blockLines = [];

  const flushBlock = () => {
    if (!currentLang || !currentTitle) {
      blockLines = [];
      return;
    }
    const entry = buildEntry(currentTitle, blockLines);
    if (!promptsByLang[currentLang]) {
      promptsByLang[currentLang] = [];
    }
    entry.id = promptsByLang[currentLang].length + 1;
    promptsByLang[currentLang].push(entry);
    blockLines = [];
    currentTitle = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\n$/, "");
    const langMatch = LANG_RE.exec(line);
    if (langMatch) {
      flushBlock();
      currentLang = slugifyLanguage(langMatch[1]);
      continue;
    }

    const titleMatch = TITLE_RE.exec(line);
    if (titleMatch) {
      flushBlock();
      currentTitle = titleMatch[1].trim();
      continue;
    }

    if (currentLang) {
      blockLines.push(line);
    }
  }

  flushBlock();
  return promptsByLang;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeOutputs(promptsByLang, outputDir) {
  ensureDir(outputDir);
  for (const [lang, prompts] of Object.entries(promptsByLang)) {
    const dest = path.join(outputDir, `prompts-${lang}.json`);
    fs.writeFileSync(dest, JSON.stringify(prompts, null, 2), "utf-8");
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--readme") {
      args.readme = argv[++i];
    } else if (arg === "--source-url") {
      args.sourceUrl = argv[++i];
    } else if (arg === "--output-dir") {
      args.outputDir = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = args.outputDir || "outputs";
  const sourceUrl =
    args.sourceUrl ||
    "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/refs/heads/main/README.md";

  const content = await readSource(args.readme, args.readme ? undefined : sourceUrl);
  const prompts = parsePrompts(content.split(/\r?\n/));
  writeOutputs(prompts, outputDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
