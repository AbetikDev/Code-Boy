# Verification report

## Windows verification, 2026-09-27

Verified the current working tree on Windows with VS Code 1.139.1.

| Command | Result |
| --- | --- |
| `npm run check` | Passed: extension and webview TypeScript |
| `npm test` | 267 passed, 0 failed, including end-to-end `clearHistory` and `pauseTracking`, collector sensitive data filters, Bob privacy gating & fallback resilience, music error handling and deactivation cancellation, and overlay port conflict handling |
| `npm run test:webview` | 11 passed, 0 failed, including floating overlay rendering with repaired CSP |
| `npm run test:host` | Passed: extension activation, navigation, webviews, commands, coding, sleep, pet, save, diagnostics, real overlay HTTP actions (`sleep`, `wake`, `vibe`), bad JSON rejection (HTTP 400), `pauseTracking` command, and overlay patch/restore on disposable VS Code test installation |
| `npm run test:vsix` | Passed: package integrity verification and automated smoke-test installation in clean temporary profile using VS Code CLI |
| `npm run package` | Passed: `code-boy-1.0.10.vsix`, 223 files, ~300 KB; dev/test/secrets excluded |

The Windows media status script and WindowsMediaProvider verify boolean status reading via Windows SMTC. Music provider failure handling, process unavailability, cancellation on extension deactivation (via `generation` counter and child process kill), and non-Windows platform guards were automated and verified in unit tests. Code Boy checks playback metadata only; it does not record microphone audio or recognize speech.

The host check verified Bob CLI discovery and gatekeeping (`contextBack.ai.enabled` and `BOB_API_KEY`). Without user consent, Bob is never called; when enabled, QualityContext sanitizes sensitive lines (`[redacted sensitive line]`), omits excluded files, and bounds prompt size to 50k chars. Tests verify that Bob timeouts, process exit errors, or malformed responses do not break the local session scenario and fall back gracefully to the local heuristic summary.

Overlay interactions were verified on multiple levels: Playwright tests verify UI clicks, dialogs, and CSP handling; host tests verify live HTTP action dispatch (`sleep`, `wake`, `vibe`) against the running VS Code overlay server, triggering actual state transitions on the character, as well as HTTP 400 rejection for malformed JSON; unit tests verify rejection when candidate loopback ports 43821–43825 are all occupied and directory traversal prevention. Visual rendering inside the GUI window remains unverified only because the Windows Computer Use helper was unavailable.

### Full requirements verification

| Requirement | Status | Evidence |
| --- | --- | --- |
| Bob code review only when `contextBack.ai.enabled` is true | ✅ Verified | `scheduleSnapshot()`, `captureSnapshot()`, `refreshQuality()`, and `buildSidebarData()` guard on `settings.aiEnabled && settings.aiProvider === 'bob'`; unit test `DisabledAIProvider and unconsented settings never execute Bob or make requests` confirms no CLI/network activity |
| Bob failure, timeout, or invalid output falls back safely | ✅ Verified | Unit tests `parseQualityResponse validates schema and rejects invalid or malformed outputs` and `SessionAnalyzer provides complete local fallback when Bob returns null or errors` confirm local analysis is preserved |
| Sensitive data redaction before sending context | ✅ Verified | `QualityContext` redacts sensitive lines, excludes `.env`, secrets, credentials, certificates, symlinks outside root, and caps at 50,000 chars; verified in unit test |
| Pause Tracking stops all collectors and cancels pending snapshots | ✅ Verified | `pauseTracking()` sets `contextBack.enabled=false`; `stopCollectors()` disposes all collectors; in-flight git poll, pending file edits, and snapshots are canceled; verified in unit test and host test command |
| Clear Project History removes entire history across all collections | ✅ Verified | `clearHistory()` removes `sessions`, `events`, `terminalCommands` (filtered by `projectId`), `fileActivity`, `errors`, `todos`, `diffSnapshots`, and `qualityCache`; leaves other projects untouched; confirmed to persist on disk without reappearing |
| Sensitive filters & edge cases for collectors | ✅ Verified | `TerminalCollector.looksLikeSensitive` catches tokens, bearer, passwords, SSH keys, AWS credentials; settings changes clear in-flight running commands; `FileCollector`, `TodoCollector`, and `DiagnosticCollector` cancel in-flight debounces when files are excluded or settings change |
| Overlay server handles port conflicts and bad requests | ✅ Verified | Unit test confirms `OverlayServer.start()` rejects when ports 43821–43825 are all occupied; rejects malformed JSON with 400; prevents directory traversal on `/assets/`; host test confirms real action transitions |
| Music state detection failure handling and deactivation | ✅ Verified | `WindowsMediaProvider` handles process errors and cancels on dispose; `MusicController` ignores in-flight polls after stop/dispose; platform guards verified for Linux/macOS |
| VSIX clean profile smoke test | ✅ Verified | `npm run test:vsix` packages VSIX, checks runtime asset presence, confirms 0 leaked dev files, and installs into a disposable VS Code profile with `--install-extension` and `--list-extensions` |
| Installed VS Code left unmodified | ✅ Verified | Both `workbench.desktop.main.js` and `workbench.html` confirmed unpatched after all tests |
| Do not add microphone-based speech recognition | ✅ Verified | No microphone or Web Speech API usage anywhere in the codebase; music is detected through SMTC/MPRIS/AppleScript only |

### What was fixed

- `TerminalCollector`: expanded sensitive pattern matching (bearer tokens, SSH keys, AWS keys, passwords, credentials) and cleared running commands on settings disable so in-flight commands are not recorded.
- `FileCollector`: updated settings change handler to cancel pending debounce edits for newly excluded files.
- `TodoCollector`: updated settings change handler to cancel pending scans when disabled or files are excluded; re-checked `trackTodos` in `scanFile`.
- `DiagnosticCollector`: updated settings change handler to clear pending scan timer when `trackDiagnostics` is disabled.
- `ContextBackController.clearHistory`: fixed terminal commands filter to clean all project-matching entries without requiring truthy `projectId`.
- `DisabledAIProvider`: added optional context dump parameters to conform to `AIProvider` signature.
- `package.json`: added `test:vsix` script for clean profile smoke test.
- `test/host/index.ts`: added real overlay HTTP action requests (`sleep`, `wake`, `vibe`), error handling, and `contextBack.pauseTracking` command test.
- Added comprehensive test suites: `test/bob-privacy.test.ts`, `test/overlay-server.test.ts`, `test/music.test.ts`, and updated `test/tracking-lifecycle.test.ts`.

### What remains unverified

| Item | Reason |
| --- | --- |
| Visual rendering of the floating mascot inside a live VS Code window | The Windows Computer Use helper was unavailable; no interactive screenshot could be taken |
| Authenticated Bob IDE code review end-to-end | No authenticated IBM Bob API key was available in this session |
| Linux MPRIS live playback detection | No Linux environment available in this run; unit parser and error handling tests pass |
| macOS Apple Music / Spotify live detection | No macOS environment available; unit script-structure and platform tests pass |

## Earlier Linux verification, 2026-09-26

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
