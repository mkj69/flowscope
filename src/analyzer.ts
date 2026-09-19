import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { CallInfo, ParameterInfo, SourceLocation, SymbolFlow } from "./model";

const supportedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

export interface AnalysisRequest {
  fileName: string;
  offset: number;
  workspaceRoot: string;
  maxDepth: number;
}

export function createWorkspaceProgram(workspaceRoot: string, activeFile: string): ts.Program {
  const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json") ??
    ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "jsconfig.json");

  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), {
      allowJs: true,
      checkJs: false,
      noEmit: true,
    }, configPath);
    return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  }

  const files = collectSourceFiles(workspaceRoot, 2500);
  if (!files.includes(activeFile)) files.push(activeFile);
  return ts.createProgram(files, {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  });
}

export function analyzeSymbol(request: AnalysisRequest): SymbolFlow {
  const program = createWorkspaceProgram(request.workspaceRoot, request.fileName);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(request.fileName);
  if (!sourceFile) throw new Error(`Unable to load ${request.fileName}`);

  const declaration = findInspectableNode(sourceFile, request.offset);
  if (!declaration) throw new Error("Place the cursor on a function, method, or class declaration.");

  const nameNode = getNameNode(declaration);
  const symbol = nameNode ? checker.getSymbolAtLocation(nameNode) : undefined;
  const name = nameNode?.getText(sourceFile) ?? "anonymous";
  const type = symbol ? checker.getTypeOfSymbolAtLocation(symbol, declaration) : checker.getTypeAtLocation(declaration);
  const callSignature = type.getCallSignatures()[0];
  const signature = callSignature
    ? checker.signatureToString(callSignature, declaration, ts.TypeFormatFlags.NoTruncation)
    : checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation);
  const parameters = callSignature ? parameterInfo(callSignature, checker, declaration) : constructorParameters(declaration, checker);
  const returnType = callSignature
    ? checker.typeToString(checker.getReturnTypeOfSignature(callSignature), declaration, ts.TypeFormatFlags.NoTruncation)
    : ts.isClassDeclaration(declaration) ? name : "unknown";

  const target = symbol ? canonicalSymbol(symbol, checker) : undefined;
  const outgoing = collectOutgoing(declaration, checker, request.maxDepth, new Set());
  const incoming = target ? collectIncoming(program, checker, target, declaration) : [];

  return {
    name,
    kind: ts.SyntaxKind[declaration.kind],
    signature,
    documentation: symbol ? ts.displayPartsToString(symbol.getDocumentationComment(checker)) : undefined,
    parameters,
    returnType,
    location: locationOf(declaration),
    incoming,
    outgoing,
  };
}

function parameterInfo(signature: ts.Signature, checker: ts.TypeChecker, at: ts.Node): ParameterInfo[] {
  return signature.getParameters().map((parameter) => {
    const declaration = parameter.valueDeclaration as ts.ParameterDeclaration | undefined;
    return {
      name: parameter.getName(),
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(parameter, declaration ?? at), at, ts.TypeFormatFlags.NoTruncation),
      optional: Boolean(parameter.flags & ts.SymbolFlags.Optional) || Boolean(declaration?.questionToken),
      defaultValue: declaration?.initializer?.getText(),
    };
  });
}

function constructorParameters(node: ts.Node, checker: ts.TypeChecker): ParameterInfo[] {
  if (!ts.isClassDeclaration(node)) return [];
  const constructor = node.members.find(ts.isConstructorDeclaration);
  if (!constructor) return [];
  return constructor.parameters.map((parameter) => ({
    name: parameter.name.getText(),
    type: checker.typeToString(checker.getTypeAtLocation(parameter), parameter, ts.TypeFormatFlags.NoTruncation),
    optional: Boolean(parameter.questionToken),
    defaultValue: parameter.initializer?.getText(),
  }));
}

function collectOutgoing(node: ts.Node, checker: ts.TypeChecker, depth: number, visited: Set<string>): CallInfo[] {
  if (depth <= 0) return [];
  const calls: CallInfo[] = [];

  const visit = (child: ts.Node): void => {
    if (child !== node && isInspectable(child)) return;
    if (ts.isCallExpression(child) || ts.isNewExpression(child)) {
      const expression = child.expression;
      const symbol = checker.getSymbolAtLocation(expression) ?? (ts.isPropertyAccessExpression(expression) ? checker.getSymbolAtLocation(expression.name) : undefined);
      if (symbol) {
        const resolved = canonicalSymbol(symbol, checker);
        const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
        if (declaration && !declaration.getSourceFile().isDeclarationFile) {
          const key = `${declaration.getSourceFile().fileName}:${declaration.pos}`;
          const type = checker.getTypeOfSymbolAtLocation(resolved, declaration);
          const callSignature = type.getCallSignatures()[0];
          const item: CallInfo = {
            name: resolved.getName(),
            signature: callSignature ? checker.signatureToString(callSignature) : undefined,
            location: locationOf(declaration),
          };
          if (!visited.has(key) && isInspectable(declaration)) {
            const nextVisited = new Set(visited);
            nextVisited.add(key);
            item.children = collectOutgoing(declaration, checker, depth - 1, nextVisited);
          }
          calls.push(item);
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return dedupeCalls(calls);
}

function collectIncoming(program: ts.Program, checker: ts.TypeChecker, target: ts.Symbol, declaration: ts.Node): CallInfo[] {
  const calls: CallInfo[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || sourceFile.fileName.includes("node_modules")) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const symbol = checker.getSymbolAtLocation(node.expression) ??
          (ts.isPropertyAccessExpression(node.expression) ? checker.getSymbolAtLocation(node.expression.name) : undefined);
        if (symbol && canonicalSymbol(symbol, checker) === target) {
          const owner = nearestInspectable(node);
          if (owner && owner !== declaration) {
            calls.push({
              name: getNameNode(owner)?.getText() ?? "top-level",
              location: locationOf(owner),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return dedupeCalls(calls);
}

function canonicalSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function findInspectableNode(sourceFile: ts.SourceFile, offset: number): ts.Node | undefined {
  let best: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (offset >= node.getFullStart() && offset <= node.getEnd()) {
      if (isInspectable(node)) best = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(sourceFile);
  return best ?? nearestInspectable(findToken(sourceFile, offset));
}

function findToken(sourceFile: ts.SourceFile, offset: number): ts.Node {
  let found: ts.Node = sourceFile;
  const visit = (node: ts.Node): void => {
    if (offset >= node.getFullStart() && offset <= node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };
  visit(sourceFile);
  return found;
}

function nearestInspectable(node: ts.Node | undefined): ts.Node | undefined {
  for (let current = node; current; current = current.parent) {
    if (isInspectable(current)) return current;
  }
  return undefined;
}

function isInspectable(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
    ts.isClassDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
}

function getNameNode(node: ts.Node): ts.Node | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node)) && node.name) return node.name;
  if (ts.isConstructorDeclaration(node)) return node.parent.name;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) return node.parent.name;
  return undefined;
}

function locationOf(node: ts.Node): SourceLocation {
  const source = node.getSourceFile();
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file: source.fileName, line: start.line, character: start.character };
}

function dedupeCalls(calls: CallInfo[]): CallInfo[] {
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.name}:${call.location.file}:${call.location.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectSourceFiles(root: string, limit: number): string[] {
  const files: string[] = [];
  const ignored = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);
  const walk = (directory: string): void => {
    if (files.length >= limit) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= limit) return;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) walk(fullPath);
      else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name))) files.push(fullPath);
    }
  };
  walk(root);
  return files;
}
