import * as path from "node:path";
import * as vscode from "vscode";
import { RelatedTest, SourceLocation, SymbolFlow } from "./model";

export class FlowPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(flow: SymbolFlow, tests: RelatedTest[], workspaceRoot: string): void {
    const panel = this.panel ?? vscode.window.createWebviewPanel(
      "flowscope.flow",
      `FlowScope: ${flow.name}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel = panel;
    panel.title = `FlowScope: ${flow.name}`;
    panel.webview.html = render(flow, tests, workspaceRoot, panel.webview.cspSource);
    panel.reveal(vscode.ViewColumn.Beside, true);
    panel.onDidDispose(() => { this.panel = undefined; });
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "open") await openLocation(message.location as SourceLocation);
      if (message.type === "runTest") await vscode.commands.executeCommand("flowscope.runRelatedTest", message.file);
    });
  }
}

async function openLocation(location: SourceLocation): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(location.file));
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  const position = new vscode.Position(location.line, location.character);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

function render(flow: SymbolFlow, tests: RelatedTest[], root: string, cspSource: string): string {
  const nonce = Math.random().toString(36).slice(2);
  const callList = (calls: SymbolFlow["outgoing"], empty: string): string => calls.length
    ? `<ul>${calls.map((call) => `<li><button class="link" data-location='${attrJson(call.location)}'>${escape(call.name)}</button>${call.signature ? `<code>${escape(call.signature)}</code>` : ""}${call.children?.length ? callList(call.children, empty) : ""}</li>`).join("")}</ul>`
    : `<p class="muted">${empty}</p>`;
  const parameters = flow.parameters.length
    ? flow.parameters.map((parameter) => `<tr><td><code>${escape(parameter.name)}${parameter.optional ? "?" : ""}</code></td><td><code>${escape(parameter.type)}</code></td><td>${escape(parameter.defaultValue ?? "—")}</td></tr>`).join("")
    : `<tr><td colspan="3" class="muted">No parameters</td></tr>`;
  const testCards = tests.length
    ? tests.map((test) => `<div class="test"><code>${escape(test.relativePath)}</code><button data-test="${escapeAttribute(test.file)}">Run test</button></div>`).join("")
    : `<p class="muted">No test file referencing this symbol was found.</p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { color-scheme: light dark; } body { padding: 24px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
  .hero { padding: 20px; border: 1px solid var(--vscode-panel-border); border-radius: 12px; background: var(--vscode-editor-background); }
  h1 { margin: 0 0 8px; font-size: 24px; } h2 { margin-top: 28px; font-size: 16px; }
  .signature { display: block; padding: 12px; overflow-x: auto; background: var(--vscode-textCodeBlock-background); border-radius: 6px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 16px; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; border-bottom: 1px solid var(--vscode-panel-border); padding: 8px; }
  ul { padding-left: 18px; } li { margin: 8px 0; } li ul { border-left: 1px solid var(--vscode-panel-border); }
  button { cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 6px 10px; border-radius: 4px; }
  button:hover { background: var(--vscode-button-hoverBackground); } button.link { color: var(--vscode-textLink-foreground); background: transparent; padding: 0; margin-right: 8px; }
  .muted { color: var(--vscode-descriptionForeground); } .test { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--vscode-panel-border); }
  .badge { display:inline-block; padding:3px 7px; border-radius:999px; background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); font-size:11px; }
</style></head><body>
<section class="hero"><span class="badge">${escape(flow.kind)}</span><h1>${escape(flow.name)}</h1><code class="signature">${escape(flow.signature)}</code>${flow.documentation ? `<p>${escape(flow.documentation)}</p>` : ""}<p><strong>Returns:</strong> <code>${escape(flow.returnType)}</code></p></section>
<h2>Contract</h2><table><thead><tr><th>Input</th><th>Type</th><th>Default</th></tr></thead><tbody>${parameters}</tbody></table>
<div class="grid"><section class="card"><h2>Called by</h2>${callList(flow.incoming, "No workspace callers found.")}</section><section class="card"><h2>Calls</h2>${callList(flow.outgoing, "No statically resolved calls found.")}</section></div>
<section><h2>Related tests</h2>${testCards}</section>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('[data-location]').forEach((el)=>el.addEventListener('click',()=>vscode.postMessage({type:'open',location:JSON.parse(el.dataset.location)})));document.querySelectorAll('[data-test]').forEach((el)=>el.addEventListener('click',()=>vscode.postMessage({type:'runTest',file:el.dataset.test})));</script>
</body></html>`;
}

function attrJson(value: unknown): string { return escapeAttribute(JSON.stringify(value)); }
function escape(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function escapeAttribute(value: string): string { return escape(value); }
