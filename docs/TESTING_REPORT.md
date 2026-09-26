# Verification report

Verified on 2026-09-26 with TypeScript type checking, Node's built-in test runner, Playwright webview tests, and a VS Code extension-host smoke test. The Node suite includes one regression test for automatic sleep with a red blocker.

| Command | Scope | Latest result |
| --- | --- | --- |
| `npm run check` | Extension and webview TypeScript | Passed |
| `npm test` | Core, ContextBack, bridge, asset, and message routing tests | 217 passed, 0 failed |
| `npx playwright test` | Browser webview tests | 9 passed, 0 failed |
| `npm run test:host` | VS Code extension host smoke test | Passed on VS Code 1.139.1 |

The Node tests cover blocker identity and resolution, warning-only diagnostics, failed test reruns, Code Boy reactions, session repositories, local persistence, and webview message validation. The Playwright suite covers the canvas and interactive webview.

## Limits

- The `bob` command is present in this development environment, but this run did not exercise an authenticated live `bob run` summary. The extension falls back to its local summary if Bob is unavailable.
- IBM Bob credentials can be loaded from the ignored workspace `.env` as `BOB_API_KEY` or inherited from the VS Code process environment; the actual key is not included in the VSIX or repository.
- The current suite does not exercise a real Bob IDE blocker-fix session. The blocker handoff is a clipboard workflow and requires a person to paste into Bob.
- No current code coverage percentage is claimed. The previous percentage in this document was not remeasured after bridge work.
- Multiple simultaneous VS Code windows remain a separate integration surface from these tests.
