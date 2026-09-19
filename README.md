# FlowScope

FlowScope is a local-first VS Code extension for understanding and verifying TypeScript and JavaScript code flows. Put the cursor on a function, method, or class and open an interactive report of its contract, callers, callees, and related tests.

## Current MVP

- `Inspect with FlowScope` CodeLens above functions, methods, and classes
- Function parameters and inferred return type
- Incoming and outgoing call relationships
- Clickable source locations
- Related Jest/Vitest test discovery by symbol usage
- Run a related test from the report
- No source code or runtime data leaves the machine

## Install locally

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host. Open a TypeScript or JavaScript project, place the cursor on a function, and run **FlowScope: Inspect Function Flow**.

To create an installable extension:

```bash
npm run package
code --install-extension flowscope-0.1.0.vsix
```

## Test execution

FlowScope detects nearby `*.test.*` and `*.spec.*` files that mention the selected symbol. By default it detects pnpm, yarn, or npm and invokes Vitest or Jest based on project dependencies.

For another runner, configure `flowscope.testCommand`, for example:

```json
{
  "flowscope.testCommand": "npm test -- {file}"
}
```

The command is only started when you explicitly click **Run test**.

## Architecture

The extension uses the TypeScript compiler API as its deterministic analysis layer. AI explanations, runtime OpenTelemetry traces, scenario capture, and change-impact testing are planned as optional layers rather than prerequisites.

## Roadmap

- Runtime traces with inputs, outputs, errors, and timings
- Save a trace as a reproducible scenario
- Branch coverage overlay on the call flow
- Change-impact test selection
- Python/Pyright adapter
- Optional AI explanations and missing-test generation

## Limitations

Dynamic dispatch, reflection, generated code, and runtime dependency injection cannot always be resolved statically. The current incoming-call scan is workspace-local and intentionally favors understandable results over whole-enterprise indexing.
