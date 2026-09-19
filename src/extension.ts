import * as path from "node:path";
import * as vscode from "vscode";
import { analyzeSymbol } from "./analyzer";
import { FlowScopeCodeLensProvider } from "./codeLens";
import { findRelatedTests } from "./testDiscovery";
import { runTest } from "./testRunner";
import { FlowPanel } from "./webview";
import { analyzePythonSymbol } from "./pythonAnalyzer";

const selector: vscode.DocumentSelector = [
  { language: "typescript", scheme: "file" },
  { language: "typescriptreact", scheme: "file" },
  { language: "javascript", scheme: "file" },
  { language: "javascriptreact", scheme: "file" },
  { language: "python", scheme: "file" },
];

let extensionRoot = "";

export function activate(context: vscode.ExtensionContext): void {
  extensionRoot = context.extensionPath;
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, new FlowScopeCodeLensProvider()),
    vscode.commands.registerCommand("flowscope.inspectSymbol", inspectSymbol),
    vscode.commands.registerCommand("flowscope.runRelatedTest", (file: string) => {
      const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath;
      if (!root) return vscode.window.showErrorMessage("FlowScope could not resolve the test workspace.");
      runTest(root, file);
    }),
  );
}

async function inspectSymbol(uri?: vscode.Uri, position?: vscode.Position): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const document = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
  const cursor = position ?? editor?.selection.active;
  if (!document || !cursor) {
    await vscode.window.showInformationMessage("Open a TypeScript or JavaScript file and place the cursor on a function.");
    return;
  }
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    await vscode.window.showErrorMessage("FlowScope requires an open workspace folder.");
    return;
  }

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "FlowScope is mapping the code flow…" }, async () => {
    try {
      const maxDepth = vscode.workspace.getConfiguration("flowscope").get<number>("maxCallDepth", 2);
      const flow = document.languageId === "python"
        ? await analyzePythonSymbol({
            fileName: document.uri.fsPath,
            line: cursor.line,
            workspaceRoot: workspaceFolder.uri.fsPath,
            maxDepth,
            pythonPath: vscode.workspace.getConfiguration("flowscope").get<string>("pythonPath", "python"),
          }, extensionRoot)
        : analyzeSymbol({
            fileName: document.uri.fsPath,
            offset: document.offsetAt(cursor),
            workspaceRoot: workspaceFolder.uri.fsPath,
            maxDepth,
          });
      const tests = await findRelatedTests(workspaceFolder.uri.fsPath, flow.name);
      FlowPanel.show(flow, tests, workspaceFolder.uri.fsPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`FlowScope: ${message}`);
    }
  });
}

export function deactivate(): void { /* nothing to dispose */ }
