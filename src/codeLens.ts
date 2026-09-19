import * as vscode from "vscode";

export class FlowScopeCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const pattern = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+[A-Za-z_$][\w$]*|class\s+[A-Za-z_$][\w$]*|(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*(?:[A-Za-z_$][\w$]*\s*)?\([^)]*\)\s*(?::[^=<{]+)?\s*[{=])/;
    for (let line = 0; line < document.lineCount; line += 1) {
      const text = document.lineAt(line).text;
      if (!pattern.test(text)) continue;
      const range = new vscode.Range(line, 0, line, text.length);
      lenses.push(new vscode.CodeLens(range, {
        title: "$(type-hierarchy) Inspect with FlowScope",
        command: "flowscope.inspectSymbol",
        arguments: [document.uri, new vscode.Position(line, Math.max(0, text.search(/\w/)))],
      }));
    }
    return lenses;
  }
}
