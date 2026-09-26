# Code Boy & ContextBack

A VS Code pixel companion that reflects project health and helps you resume interrupted work. Built for the [IBM Bob 2.0 Hackathon](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon).

## What it does

- **ContextBack** records local session metadata: recent files, diagnostics, recognized test command exit codes, TODO comments, git commits, and uncommitted files. Its dashboard and Welcome Back card show what needs attention.
- **Code Boy** reacts to coding, builds, music, and project health. A current error or failing test can make it concerned; verified blocker resolution earns a celebration. A commit is a separate milestone and does not resolve blockers.
- **IBM Bob Shell summaries** are optional. When enabled, ContextBack sends a bounded metadata summary to the installed `bob run` command in Ask mode and displays Bob's response. If Bob is unavailable, the local deterministic summary remains available.
- **Resolve Blocker with Bob** previews a prompt containing the latest red blocker's file path and error, then copies it to the clipboard after confirmation. Paste it into IBM Bob IDE or Shell to ask Bob to investigate and fix the issue. The extension does not dispatch this command automatically.

## Architecture

```text
VS Code activity -> ContextBack collectors -> local JSON store
                                    |             |
                                    v             v
                            health snapshots   dashboard / Welcome Back
                                    |
                            ContextBoyBridge
                                    |
                            Code Boy companion

Optional session summary: ContextBack -> bob run (Ask mode) -> summary
Manual blocker handoff: preview -> clipboard -> IBM Bob IDE / Shell
```

ContextBack stores data in `~/.contextback/context.json`. With Bob summaries disabled, it does not send session metadata to Bob. When enabled, the prompt can include file paths, diagnostic messages, command names, TODO text, commit messages, and diff statistics. Review those fields before enabling Bob in a sensitive repository.

## Run locally

Requires VS Code 1.96+ and Node.js for development.

```sh
npm install
npm run compile
```

Use **Ctrl+F5** in VS Code to run the **Run Code Boy** configuration without a debugger, or **F5** when debugging the extension. The Extension Development Host opens this project folder. Use **ContextBack: Open Dashboard** and **Code Boy: Open** from the command palette.

To build an installable extension:

```sh
npm run package
```

Then choose **Extensions → … → Install from VSIX** and select `code-boy-1.0.0.vsix`. The package is generated locally; it is not a published release unless uploaded separately.

## Connect IBM Bob

1. [Install IBM Bob Shell](https://bob.ibm.com/docs/shell/getting-started/install-and-setup) and authenticate it. Bob Shell currently requires Node.js 24+; the extension itself does not require Bob.
2. Add your IBM Bob Inference API key as `BOB_API_KEY=...` in the workspace `.env` file (or set it in the environment used to launch VS Code). The extension reads the key locally and passes it only to the Bob Shell child process. Do not commit `.env` or paste the key into chat or logs.
3. In VS Code settings, enable `contextBack.ai.enabled`; `contextBack.ai.provider` defaults to `bob`.
4. Run **ContextBack: Summarize Last Session**. Bob Shell receives session metadata and returns a structured summary. The call has a 45 second timeout and cost and turn limits.

The existing **Code Boy: Resolve Blocker with Bob** command uses a manual clipboard handoff. Bob Shell summarization and manual blocker fixing are separate flows. See the [IBM Bob Shell CLI documentation](https://bob.ibm.com/docs/shell/getting-started/start-bobshell-non-interactive).

## Main commands

| Command | Purpose |
| --- | --- |
| `contextBack.openDashboard` | Show recent work and open threads |
| `contextBack.continueSession` | Reopen recent files from the last session |
| `contextBack.summarizeSession` | Show a local summary or ask Bob Shell when enabled |
| `contextBack.showOpenThreads` | Inspect red and yellow threads |
| `codeBoy.resolveBlockerWithBob` | Preview and copy a blocker prompt for Bob |
| `codeBoy.resumeSession` | Open the ContextBack dashboard |

## Verification

```sh
npm run check
npm test
npx playwright test
```

Results and remaining limits are recorded in [docs/TESTING_REPORT.md](docs/TESTING_REPORT.md). Submission preparation is in [docs/SUBMISSION_KIT.md](docs/SUBMISSION_KIT.md). IBM Bob task screenshots are in the required [bob_sessions/](bob_sessions/) directory, with descriptions in [docs/ibm-bob/](docs/ibm-bob/).

## License

MIT. [Source repository](https://github.com/AbetikDev/Code-Boy).
