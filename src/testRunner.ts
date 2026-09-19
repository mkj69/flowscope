import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export function runTest(workspaceRoot: string, file: string): void {
  const configuration = vscode.workspace.getConfiguration("flowscope");
  const custom = configuration.get<string>("testCommand", "").trim();
  const quotedFile = quote(file);
  const command = custom
    ? custom.replaceAll("{file}", quotedFile)
    : inferCommand(workspaceRoot, quotedFile);

  const terminal = vscode.window.createTerminal({ name: "FlowScope Tests", cwd: workspaceRoot });
  terminal.show();
  terminal.sendText(command, true);
}

function inferCommand(root: string, quotedFile: string): string {
  const packageJsonPath = path.join(root, "package.json");
  let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  if (fs.existsSync(packageJsonPath)) {
    try { packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")); } catch { /* use defaults */ }
  }
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const runner = dependencies.vitest ? "vitest run" : dependencies.jest ? "jest" : "npm test --";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return `pnpm exec ${runner} ${quotedFile}`;
  if (fs.existsSync(path.join(root, "yarn.lock"))) return `yarn ${runner} ${quotedFile}`;
  if (runner === "npm test --") return `${runner} ${quotedFile}`;
  return `npx ${runner} ${quotedFile}`;
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}
