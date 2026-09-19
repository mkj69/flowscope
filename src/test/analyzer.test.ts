import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeSymbol } from "../analyzer";

test("extracts a function contract and call relationships", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flowscope-"));
  const file = path.join(root, "sample.ts");
  const source = `
function double(value: number): number { return value * 2; }
export function calculate(input: number, offset = 1): number {
  return double(input) + offset;
}
export function endpoint(): number { return calculate(4); }
`;
  fs.writeFileSync(file, source);
  const flow = analyzeSymbol({ fileName: file, offset: source.indexOf("calculate"), workspaceRoot: root, maxDepth: 2 });
  assert.equal(flow.name, "calculate");
  assert.equal(flow.returnType, "number");
  assert.deepEqual(flow.parameters.map((parameter) => parameter.name), ["input", "offset"]);
  assert.equal(flow.parameters[1].defaultValue, "1");
  assert.ok(flow.outgoing.some((call) => call.name === "double"));
  assert.ok(flow.incoming.some((call) => call.name === "endpoint"));
});
