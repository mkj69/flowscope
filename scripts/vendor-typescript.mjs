import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const analyzer = path.join(root, "out", "analyzer.js");
const vendorDirectory = path.join(root, "vendor");
fs.mkdirSync(vendorDirectory, { recursive: true });
fs.copyFileSync(
  path.join(root, "node_modules", "typescript", "lib", "typescript.js"),
  path.join(vendorDirectory, "typescript.js"),
);
const compiled = fs.readFileSync(analyzer, "utf8");
fs.writeFileSync(analyzer, compiled.replace('require("typescript")', 'require("../vendor/typescript")'));
