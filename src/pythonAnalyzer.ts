import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import { SymbolFlow } from "./model";

const execFileAsync = promisify(execFile);

export interface PythonAnalysisRequest {
  fileName: string;
  line: number;
  workspaceRoot: string;
  maxDepth: number;
  pythonPath: string;
}

export async function analyzePythonSymbol(request: PythonAnalysisRequest, extensionRoot: string): Promise<SymbolFlow> {
  const bridge = path.join(extensionRoot, "python", "analyze.py");
  try {
    const { stdout } = await execFileAsync(request.pythonPath, [
      bridge,
      "--file", request.fileName,
      "--line", String(request.line + 1),
      "--root", request.workspaceRoot,
      "--depth", String(request.maxDepth),
    ], { cwd: request.workspaceRoot, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    return JSON.parse(stdout) as SymbolFlow;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Python analysis failed. Check flowscope.pythonPath. ${details}`);
  }
}
