#!/usr/bin/env node

/**
 * Automated PR Code Review — Codex Workflow Demo
 *
 * Reads a unified diff (from a file or stdin) and produces a structured
 * code review using GPT-5 via the OpenAI Responses API.
 *
 * Usage:
 *   node review.mjs <diff-file>              # review from file
 *   git diff | node review.mjs               # review from stdin
 *   node review.mjs --summary example.patch  # PR summary only
 *   node review.mjs --json example.patch     # JSON output
 *   node review.mjs --output review.md ...   # write to file
 */

import { readFileSync, writeFileSync } from "node:fs";
import { REVIEW_SYSTEM_PROMPT, SUMMARY_PROMPT } from "./prompts.mjs";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const flags = {
  summary: false,
  json: false,
  output: null,
  file: null,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--summary":
      flags.summary = true;
      break;
    case "--json":
      flags.json = true;
      break;
    case "--output":
      flags.output = args[++i];
      if (!flags.output) {
        console.error("Error: --output requires a file path argument.");
        process.exit(1);
      }
      break;
    case "--help":
    case "-h":
      printUsage();
      process.exit(0);
      break;
    default:
      if (args[i].startsWith("-")) {
        console.error(`Unknown flag: ${args[i]}`);
        printUsage();
        process.exit(1);
      }
      flags.file = args[i];
  }
}

function printUsage() {
  console.log(`
Usage: node review.mjs [options] [diff-file]

Options:
  --summary        Generate a PR summary instead of a full review
  --json           Output machine-readable JSON
  --output <file>  Write the review to a file
  -h, --help       Show this help message

If no diff-file is provided, reads from stdin.
  `);
}

// ---------------------------------------------------------------------------
// Read diff content
// ---------------------------------------------------------------------------

let diffContent;

if (flags.file) {
  try {
    diffContent = readFileSync(flags.file, "utf-8");
  } catch (err) {
    console.error(`Error: Could not read file "${flags.file}": ${err.message}`);
    process.exit(1);
  }
} else if (!process.stdin.isTTY) {
  diffContent = readFileSync("/dev/stdin", "utf-8");
} else {
  console.error("Error: No diff provided. Pass a file path or pipe via stdin.");
  printUsage();
  process.exit(1);
}

if (!diffContent.trim()) {
  console.error("Error: Diff content is empty.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate API key
// ---------------------------------------------------------------------------

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "Error: OPENAI_API_KEY environment variable is not set.\n" +
      "Export your key before running:\n\n" +
      "  export OPENAI_API_KEY=sk-...\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Call GPT-5 via Responses API
// ---------------------------------------------------------------------------

const OpenAI = (await import("openai")).default;
const openai = new OpenAI();

const instructions = flags.summary ? SUMMARY_PROMPT : REVIEW_SYSTEM_PROMPT;

console.error(
  flags.summary ? "Generating PR summary..." : "Reviewing diff..."
);

let response;
try {
  response = await openai.responses.create({
    model: "gpt-5",
    instructions,
    input: diffContent,
  });
} catch (err) {
  console.error(`OpenAI API error: ${err.message}`);
  process.exit(1);
}

// Extract text from the response output items
const reviewText = response.output
  .filter((item) => item.type === "message")
  .flatMap((item) => item.content)
  .filter((block) => block.type === "output_text")
  .map((block) => block.text)
  .join("\n");

// ---------------------------------------------------------------------------
// Format and output
// ---------------------------------------------------------------------------

let output;

if (flags.json) {
  output = JSON.stringify(
    {
      model: "gpt-5",
      mode: flags.summary ? "summary" : "review",
      review: reviewText,
    },
    null,
    2
  );
} else {
  output = reviewText;
}

if (flags.output) {
  writeFileSync(flags.output, output, "utf-8");
  console.error(`Review written to ${flags.output}`);
} else {
  console.log(output);
}
