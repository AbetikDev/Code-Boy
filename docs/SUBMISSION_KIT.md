# IBM Bob 2.0 hackathon submission draft

This is a draft based on the implemented product. Check the [current hackathon page](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon) for the final rules, deadline, required assets, and form limits before submitting.

## Project

- **Name:** Code Boy & ContextBack
- **Repository:** https://github.com/AbetikDev/Code-Boy
- **Product:** VS Code extension with Developer Intelligence, ContextBack, Canvas webview, local persistence, and optional IBM Bob Shell summaries.
- **Installable build:** [Download code-boy-1.0.10.vsix](https://raw.githubusercontent.com/AbetikDev/Code-Boy/download-vsix-1.0.10/downloads/code-boy-1.0.10.vsix) (SHA-256 `5C8C334F9C9BEE53094B39CCE7980B29BC369B6CBCB2DD14BE7AB0E3356439AB`). Built from the current working tree and verified by downloading the public file and comparing checksums. The downloadable binary is on the dedicated `download-vsix-1.0.10` branch.

## Problem and solution

Returning to a project after a break often means reconstructing the last task from recent files, failed tests, diagnostics, and git changes. ContextBack records those signals locally and shows a Welcome Back view and open threads. Code Boy reflects the same health snapshot in an ambient pixel companion: it looks concerned about current red blockers, celebrates when a known blocker disappears, and treats commits as independent milestones.

For deeper analysis, the user can opt into IBM Bob Shell summaries. ContextBack passes bounded session metadata to `bob run` in Ask mode and displays a structured response. For a red blocker, a separate command previews the error, file path, and numeric project health summary, then copies a prompt for Bob IDE to inspect the repository. Bob can investigate the repository there. The extension observes the subsequent diagnostic or test result and reacts when the blocker is verified as gone.

## IBM Bob usage statement

The shipped integration calls the documented Bob Shell noninteractive CLI for optional session summaries. This path requires the user to install and authenticate Bob Shell. The blocker workflow is currently manual: preview prompt, confirm copy, paste into Bob IDE, review Bob's actions, then rerun the relevant check. There is no direct IBM Bob IDE chat API integration and no automatic agent dispatch from VS Code.

The repository-root [bob_sessions/](../bob_sessions/) contains two Bob task consumption-summary captures: test coverage and full-project review. The [evidence audit](ibm-bob/README.md) documents these captures. Verify that these represent all relevant Bob tasks across your registered participants before final submission.

## Demo sequence

1. The checked-in `demo/discount-bug` fixture now passes. For the Bob handoff recording, make a disposable copy, change `>= 100` to `> 100` in the copy, and open it as the workspace. Run `npm test`; show the failing threshold test, ContextBack red thread, and Code Boy's concern state. Keep the checked-in fixture fixed.
2. Leave and reopen the project to show the recovered session and Welcome Back card.
3. Run **Code Boy: Resolve Blocker with Bob**, review the prompt, confirm the copy, and paste it into IBM Bob. Show Bob's real response and any resulting diff.
4. Rerun the diagnostic or test. Show the same blocker identity disappearing and Code Boy celebrating.
5. Optionally run **ContextBack: Summarize Last Session**. An authenticated Bob Shell summary returned in the Linux extension-host smoke test.

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [PRESENTATION.md](PRESENTATION.md) to record and present the run. The only measured before/after result so far is an [automated local rehearsal](ibm-bob/discount-before-after-measurement.json): a deliberately failing discount test ran in 107.01 ms (1 pass, 1 fail), and the corrected version ran in 107.73 ms (2 passes). The complete scripted fail-to-pass sequence took 215.33 ms. This measures test execution and one scripted edit, not human productivity or Bob IDE performance. A continuous Bob IDE video is still needed before claiming the full flow.

## Submission checklist

- [x] Verify the repository is publicly readable at the URL above.
- [x] Build and inspect `code-boy-1.0.10.vsix` locally.
- [x] Upload the VSIX and add the verified public download link.
- [ ] Record and link a real product demo.
- [ ] Capture the actual IBM Bob task session consumption summaries for all relevant tasks and registered participants in `bob_sessions/`.
- [ ] Capture the Bob IDE discount-blocker fix, its task summary, and the continuous end-to-end recording.
- [ ] Confirm the exact submission closing time in the registered account.
