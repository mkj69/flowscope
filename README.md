# FlowScope

FlowScope is a local-first VS Code extension for understanding and verifying Python, TypeScript, and JavaScript code flows. Put the cursor on a function, method, or class and open an interactive report of its contract, callers, callees, and related tests. Python is a first-class target and uses the standard-library AST, so analysis does not require importing or executing project code.

## Current MVP

- `Inspect with FlowScope` CodeLens above Python `def`, `async def`, classes and JS/TS symbols
- Function parameters and inferred return type
- Incoming and outgoing call relationships
- Clickable source locations
- Related pytest/Jest/Vitest test discovery by symbol usage
- Run a related test from the report
- No source code or runtime data leaves the machine

## Install locally

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host. Open a Python, TypeScript, or JavaScript project, place the cursor on a function, and run **FlowScope: Inspect Function Flow**.

To create an installable extension:

```bash
npm run package
code --install-extension flowscope-0.2.0.vsix
```

## Test execution

FlowScope detects Python `test_*.py`/`*_test.py` files and JS/TS `*.test.*`/`*.spec.*` files that mention the selected symbol. Python tests run through `python -m pytest`; JS/TS tests use Vitest or Jest based on project dependencies.

If Python is not available as `python`, configure the interpreter path:

```json
{
  "flowscope.pythonPath": "C:\\path\\to\\python.exe"
}
```

For another runner, configure `flowscope.testCommand`, for example:

```json
{
  "flowscope.testCommand": "npm test -- {file}"
}
```

The command is only started when you explicitly click **Run test**.

## Architecture

The extension uses Python's standard-library AST and the TypeScript compiler API as deterministic analysis layers. AI explanations, runtime OpenTelemetry traces, scenario capture, and change-impact testing are planned as optional layers rather than prerequisites.

## Roadmap

- Runtime traces with inputs, outputs, errors, and timings
- Save a trace as a reproducible scenario
- Branch coverage overlay on the call flow
- Change-impact test selection
- Pyright-enhanced type resolution across virtual environments
- Optional AI explanations and missing-test generation

## Limitations

Dynamic dispatch, reflection, generated code, and runtime dependency injection cannot always be resolved statically. The current incoming-call scan is workspace-local and intentionally favors understandable results over whole-enterprise indexing.
