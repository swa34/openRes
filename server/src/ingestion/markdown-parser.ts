/**
 * DocScope — Markdown/MDX documentation parser
 *
 * Splits markdown files by heading boundaries (h1/h2/h3) into DocumentChunk[]
 * for embedding and vector store upsert. Each chunk retains section context
 * in its metadata.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pino from "pino";
import type { DocumentChunk, ChunkMetadata } from "../types.js";

const log = pino({ name: "docscope:markdown-parser" });

// ─── Heading detection ───

interface Section {
  level: number;       // 1, 2, or 3
  title: string;       // heading text (without # prefix)
  content: string;     // full section content including the heading line
  lineStart: number;   // 1-indexed line number
}

/**
 * Split markdown text into sections based on headings.
 * Each section runs from one heading to the next heading of equal or higher level.
 */
function splitByHeadings(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];

  const flushSection = () => {
    if (currentSection) {
      currentSection.content = contentLines.join("\n").trim();
      if (currentSection.content.length > 0) {
        sections.push(currentSection);
      }
      contentLines.length = 0;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      flushSection();

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      currentSection = {
        level,
        title,
        content: "",
        lineStart: i + 1,
      };
      contentLines.push(line);
    } else if (currentSection) {
      contentLines.push(line);
    } else {
      // Content before any heading — treat as a preamble section
      if (!currentSection && line.trim().length > 0) {
        currentSection = {
          level: 0,
          title: "Overview",
          content: "",
          lineStart: i + 1,
        };
      }
      contentLines.push(line);
    }
  }

  flushSection();
  return sections;
}

// ─── MDX preprocessing ───

/**
 * Strip MDX-specific syntax (JSX components, imports, exports) so that
 * the remaining text is plain markdown suitable for embedding.
 */
function stripMdxSyntax(text: string): string {
  let result = text;

  // Remove import/export statements
  result = result.replace(/^(?:import|export)\s+.*$/gm, "");

  // Remove self-closing JSX tags: <Component prop="val" />
  result = result.replace(/<[A-Z]\w*\s*[^>]*\/>/g, "");

  // Remove opening and closing JSX tags but keep inner content
  // e.g. <Callout type="info">content</Callout> → content
  result = result.replace(/<([A-Z]\w*)\s*[^>]*>([\s\S]*?)<\/\1>/g, "$2");

  // Remove remaining JSX-style tags
  result = result.replace(/<\/?[A-Z]\w*\s*[^>]*>/g, "");

  // Collapse excessive blank lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

// ─── Stable ID generation ───

function generateChunkId(api: string, source: string, sectionTitle: string, index: number): string {
  const input = `${api}:${source}:${sectionTitle}:${index}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 16);
}

// ─── Public API ───

/**
 * Parse a markdown or MDX file into DocumentChunk[], splitting by headings.
 *
 * Each chunk corresponds to a section (h1/h2/h3) and includes:
 * - The heading and all content until the next heading of equal or higher level
 * - Metadata with api name, source file, section title, type="guide"
 */
export async function parseMarkdownFile(
  filePath: string,
  apiName: string,
): Promise<DocumentChunk[]> {
  log.info({ filePath, apiName }, "Parsing markdown file");

  let rawContent: string;
  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (err) {
    log.error({ err, filePath }, "Failed to read markdown file");
    throw new Error(
      `Failed to read markdown file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (rawContent.trim().length === 0) {
    log.warn({ filePath }, "Markdown file is empty");
    return [];
  }

  // Strip MDX syntax if present
  const isMdx = filePath.endsWith(".mdx");
  const content = isMdx ? stripMdxSyntax(rawContent) : rawContent;

  const sections = splitByHeadings(content);

  if (sections.length === 0) {
    log.warn({ filePath }, "No sections found in markdown file");
    return [];
  }

  const chunks: DocumentChunk[] = sections.map((section, index) => ({
    id: generateChunkId(apiName, filePath, section.title, index),
    text: section.content,
    metadata: {
      api: apiName,
      source: filePath,
      chunkIndex: index,
      totalChunks: sections.length,
      type: "guide" as const,
    },
  }));

  log.info(
    { filePath, apiName, sectionsFound: sections.length, chunksCreated: chunks.length },
    "Markdown parsing complete",
  );

  return chunks;
}
