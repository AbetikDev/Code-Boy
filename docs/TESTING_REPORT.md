# Verification report

Verified on 2026-09-26 on Linux. The Developer Intelligence Layer is included in the `code-boy-1.0.10.vsix` build.

| Command | Result |
| --- | --- |
| `npm run check` | Passed: extension and webview TypeScript |
| `npm test` | 236 passed, 0 failed: domain, intelligence, ContextBack, bridge, music parser, migration, and persistence tests |
| `npm run test:webview` | 9 passed, 0 failed after rebuilding the webview bundle |
| `npm run test:host` | Passed on VS Code 1.139.1: activation, navigation, editing, diagnostics, and commands |
| `npm run package` | Passed: `code-boy-1.0.10.vsix`, 225 files, 436.35 KB |

The Linux MPRIS implementation was exercised through parser tests and a local session bus query. No MPRIS player was active in this environment, so live playback detection remains unverified. macOS Apple Music and Spotify have platform script checks; playback on a Mac remains unverified. A Windows playback and VSIX smoke test still needs a Windows machine.

The extension-host Bob Shell check found the ignored local `.env` key and resolved the npm-installed CLI outside `PATH`. An authenticated read-only `bob run` returned a session summary. The key and response content were not printed or packaged. The existing `bob_sessions/` images document prior Bob IDE test tasks; a new end-to-end blocker handoff and verification recording has not yet been captured.

The public event page lists September 25–27, 2026. It does not expose the exact account-specific submission closing time; verify that time in the registered lablab.ai account before submitting.
