#!/usr/bin/env node
import fs from "fs";
import path from "path";

interface PromptEntry {
  author: string;
  authorUrl: string;
  category: string;
  id: number;
  imageUrl: string;
  prompt: string;
  tags: string[];
  title: string;
  description: string;
}

const LANG_FALLBACKS: Record<string, string> = {
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

type PromptsByLang = Record<string, PromptEntry[]>;

type ArgMap = {
  readme?: string;
  sourceUrl?: string;
  outputDir?: string;
};

function slugifyLanguage(title: string): string {
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

async function readSource(readmePath?: string, sourceUrl?: string): Promise<string> {
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

function buildEntry(title: string, blockLines: string[]): PromptEntry {
  const data: Record<string, string> = {
    title,
    prompt: "",
    description: "",
  };

  let collectingKey: string | null = null;
  let continuation: string[] = [];

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
      const mappedKey =
        { authorurl: "authorUrl", image: "imageUrl" }[normalizedKey] || key;

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

function parsePrompts(lines: string[]): PromptsByLang {
  const promptsByLang: PromptsByLang = {};
  let currentLang: string | null = null;
  let currentTitle: string | null = null;
  let blockLines: string[] = [];

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

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeOutputs(promptsByLang: PromptsByLang, outputDir: string) {
  ensureDir(outputDir);
  for (const [lang, prompts] of Object.entries(promptsByLang)) {
    const dest = path.join(outputDir, `prompts-${lang}.json`);
    fs.writeFileSync(dest, JSON.stringify(prompts, null, 2), "utf-8");
  }
}

function parseArgs(argv: string[]): ArgMap {
  const args: ArgMap = {};
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
