# Verification report

## Windows verification, 2026-09-27

Verified the current working tree on Windows with VS Code 1.139.1.

| Command | Result |
| --- | --- |
| `npm run check` | Passed: extension and webview TypeScript |
| `npm test` | 247 passed, 0 failed, including session timeout, paused Git polling, database retry, safe branch restore, and music priority checks |
| `npm run test:webview` | 11 passed, 0 failed, including floating overlay rendering |
| `npm run test:host` | Passed: extension activation, navigation, webviews, commands, coding, sleep, pet, save, and diagnostics |
| `npm run package` | Passed: `code-boy-1.0.10.vsix`, 223 files, about 300 KB; Bob session screenshots excluded |

The Windows media status script first returned `false`. Later, Windows SMTC reported a Spotify session with status `Playing`; the script and `WindowsMediaProvider.isPlaying()` both returned `true`. This verifies both boolean paths through the Windows provider against the system playback status. The actual sound was not listened to, and stopping playback was not controlled as part of this test. Code Boy checks playback metadata through Windows SMTC; it does not record microphone audio or recognize speech. The optional sound effects use a local Web Audio oscillator. Linux and macOS live playback were not retested in this Windows run.

The host check reported `BOB SHELL HOST CHECK: key configured=false, CLI found=true, summary=not attempted`. Authenticated Bob review and an end-to-end Bob IDE blocker fix were not verified in this run. The floating overlay UI tests passed, but no manual check of a patched VS Code installation was performed.

The code now requires `contextBack.ai.enabled` for Bob code reviews and local diff snapshots. Pause Tracking stops collectors and ends the current session. Clear History ends the session and removes project terminal records before starting a clean session. Terminal command strings are still stored locally when terminal tracking is enabled; the sensitive-command filter is heuristic.

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
