import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findRelatedTests } from "../testDiscovery";

test("finds tests that reference the selected symbol", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flowscope-tests-"));
  fs.writeFileSync(path.join(root, "order.test.ts"), "describe('order', () => createOrder());");
  fs.writeFileSync(path.join(root, "other.test.ts"), "describe('other', () => true);");
  const related = await findRelatedTests(root, "createOrder");
  assert.deepEqual(related.map((testFile) => testFile.relativePath), ["order.test.ts"]);
});
