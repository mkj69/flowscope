"""Static Python symbol and call-flow analyzer used by the FlowScope extension."""

from __future__ import annotations

import argparse
import ast
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


IGNORED_DIRS = {".git", ".venv", "venv", "__pycache__", "node_modules", "dist", "build", ".tox", ".mypy_cache"}


@dataclass
class Definition:
    name: str
    qualified_name: str
    node: ast.AST
    file: Path
    source: str


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--line", type=int, required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--depth", type=int, default=2)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    target_file = Path(args.file).resolve()
    definitions = index_workspace(root)
    target = find_target(definitions, target_file, args.line)
    if target is None:
        raise SystemExit("Place the cursor on a Python function, method, or class declaration.")

    by_name: dict[str, list[Definition]] = {}
    for definition in definitions:
        by_name.setdefault(definition.name, []).append(definition)

    result = symbol_flow(target, definitions, by_name, max(1, args.depth))
    print(json.dumps(result, ensure_ascii=False))


def index_workspace(root: Path, limit: int = 2500) -> list[Definition]:
    definitions: list[Definition] = []
    count = 0
    for directory, names, files in os.walk(root):
        names[:] = [name for name in names if name not in IGNORED_DIRS]
        for filename in files:
            if not filename.endswith(".py"):
                continue
            count += 1
            if count > limit:
                return definitions
            path = Path(directory, filename).resolve()
            try:
                source = path.read_text(encoding="utf-8")
                tree = ast.parse(source, filename=str(path))
            except (OSError, UnicodeError, SyntaxError):
                continue
            collect_definitions(tree, path, source, definitions)
    return definitions


def collect_definitions(tree: ast.AST, file: Path, source: str, output: list[Definition]) -> None:
    def visit(node: ast.AST, parents: list[str]) -> None:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            qualified = ".".join([*parents, node.name])
            output.append(Definition(node.name, qualified, node, file, source))
            parents = [*parents, node.name]
        for child in ast.iter_child_nodes(node):
            visit(child, parents)
    visit(tree, [])


def find_target(definitions: list[Definition], file: Path, line: int) -> Definition | None:
    matches = [definition for definition in definitions if definition.file == file and contains_line(definition.node, line)]
    return min(matches, key=lambda definition: node_end(definition.node) - getattr(definition.node, "lineno", 1), default=None)


def contains_line(node: ast.AST, line: int) -> bool:
    return getattr(node, "lineno", 0) <= line <= node_end(node)


def node_end(node: ast.AST) -> int:
    return getattr(node, "end_lineno", getattr(node, "lineno", 0))


def symbol_flow(target: Definition, definitions: list[Definition], by_name: dict[str, list[Definition]], depth: int) -> dict:
    node = target.node
    is_class = isinstance(node, ast.ClassDef)
    callable_node = class_constructor(node) if is_class else node
    parameters = parameters_for(callable_node) if isinstance(callable_node, (ast.FunctionDef, ast.AsyncFunctionDef)) else []
    return_annotation = annotation_text(getattr(callable_node, "returns", None)) if callable_node else target.name
    signature = signature_for(target, callable_node)
    return {
        "name": target.name,
        "kind": type(node).__name__,
        "signature": signature,
        "documentation": ast.get_docstring(node),
        "parameters": parameters,
        "returnType": target.name if is_class else return_annotation or "Any",
        "location": location(target),
        "incoming": incoming_calls(target, definitions),
        "outgoing": outgoing_calls(target, by_name, depth, set()),
    }


def class_constructor(node: ast.ClassDef) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
    return next((child for child in node.body if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and child.name == "__init__"), None)


def parameters_for(node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[dict]:
    positional = [*node.args.posonlyargs, *node.args.args]
    defaults = [None] * (len(positional) - len(node.args.defaults)) + list(node.args.defaults)
    parameters: list[dict] = []
    for argument, default in zip(positional, defaults):
        if argument.arg in {"self", "cls"}:
            continue
        parameters.append(parameter(argument, default, default is not None))
    if node.args.vararg:
        parameters.append({"name": "*" + node.args.vararg.arg, "type": annotation_text(node.args.vararg.annotation) or "Any", "optional": True})
    for argument, default in zip(node.args.kwonlyargs, node.args.kw_defaults):
        parameters.append(parameter(argument, default, default is not None))
    if node.args.kwarg:
        parameters.append({"name": "**" + node.args.kwarg.arg, "type": annotation_text(node.args.kwarg.annotation) or "Any", "optional": True})
    return parameters


def parameter(argument: ast.arg, default: ast.expr | None, optional: bool) -> dict:
    value = {"name": argument.arg, "type": annotation_text(argument.annotation) or "Any", "optional": optional}
    if default is not None:
        value["defaultValue"] = ast.unparse(default)
    return value


def signature_for(target: Definition, callable_node: ast.AST | None) -> str:
    if isinstance(callable_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        prefix = "async def" if isinstance(callable_node, ast.AsyncFunctionDef) else "def"
        params = []
        for item in parameters_for(callable_node):
            text = item["name"] + (f": {item['type']}" if item["type"] else "")
            if "defaultValue" in item:
                text += f" = {item['defaultValue']}"
            params.append(text)
        return_type = annotation_text(callable_node.returns) or "Any"
        name = target.name if not isinstance(target.node, ast.ClassDef) else target.name
        if isinstance(target.node, ast.ClassDef):
            return f"class {name}({', '.join(params)})"
        return f"{prefix} {name}({', '.join(params)}) -> {return_type}"
    return f"class {target.name}"


def annotation_text(node: ast.AST | None) -> str:
    return ast.unparse(node) if node is not None else ""


def outgoing_calls(target: Definition, by_name: dict[str, list[Definition]], depth: int, visited: set[str]) -> list[dict]:
    if depth <= 0:
        return []
    calls: list[dict] = []
    for node in ast.walk(target.node):
        if not isinstance(node, ast.Call):
            continue
        name = called_name(node.func)
        if not name or name == target.name:
            continue
        candidates = by_name.get(name, [])
        if not candidates:
            continue
        candidate = prefer_candidate(candidates, target.file)
        key = f"{candidate.file}:{getattr(candidate.node, 'lineno', 0)}"
        item = {"name": candidate.qualified_name, "location": location(candidate)}
        if key not in visited:
            item["children"] = outgoing_calls(candidate, by_name, depth - 1, {*visited, key})
        calls.append(item)
    return dedupe(calls)


def incoming_calls(target: Definition, definitions: Iterable[Definition]) -> list[dict]:
    calls: list[dict] = []
    for definition in definitions:
        if definition is target:
            continue
        if any(isinstance(node, ast.Call) and called_name(node.func) == target.name for node in ast.walk(definition.node)):
            calls.append({"name": definition.qualified_name, "location": location(definition)})
    return dedupe(calls)


def called_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def prefer_candidate(candidates: list[Definition], current_file: Path) -> Definition:
    return next((candidate for candidate in candidates if candidate.file == current_file), candidates[0])


def location(definition: Definition) -> dict:
    return {"file": str(definition.file), "line": max(0, getattr(definition.node, "lineno", 1) - 1), "character": max(0, getattr(definition.node, "col_offset", 0))}


def dedupe(items: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    result = []
    for item in items:
        location_value = item["location"]
        key = (item["name"], location_value["file"], location_value["line"])
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


if __name__ == "__main__":
    main()
