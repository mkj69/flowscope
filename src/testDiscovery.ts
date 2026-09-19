import * as fs from "node:fs/promises";
import * as path from "node:path";
import { RelatedTest } from "./model";

const testPattern = /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
const ignored = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

export async function findRelatedTests(root: string, symbolName: string, maxFiles = 1000): Promise<RelatedTest[]> {
  const candidates: string[] = [];
  await walk(root, candidates, maxFiles);
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const usage = new RegExp(`\\b${escaped}\\b`);
  const related: RelatedTest[] = [];

  for (const file of candidates) {
    const content = await fs.readFile(file, "utf8");
    if (usage.test(content)) related.push({ file, relativePath: path.relative(root, file) });
  }
  return related;
}

async function walk(directory: string, files: string[], limit: number): Promise<void> {
  if (files.length >= limit) return;
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (files.length >= limit) return;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) await walk(fullPath, files, limit);
    else if (entry.isFile() && testPattern.test(entry.name)) files.push(fullPath);
  }
}
