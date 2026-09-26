# IBM Bob 2.0 hackathon submission draft

This is a draft based on the implemented product. Check the [current hackathon page](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon) for the final rules, deadline, required assets, and form limits before submitting.

## Project

- **Name:** Code Boy & ContextBack
- **Repository:** https://github.com/AbetikDev/Code-Boy
- **Product:** VS Code extension with Developer Intelligence, ContextBack, Canvas webview, local persistence, and optional IBM Bob Shell summaries.
- **Installable build:** Run `npm run package` to create `code-boy-1.0.10.vsix`. Upload that file to a release or the submission form before presenting it as a downloadable artifact.

## Problem and solution

Returning to a project after a break often means reconstructing the last task from recent files, failed tests, diagnostics, and git changes. ContextBack records those signals locally and shows a Welcome Back view and open threads. Code Boy reflects the same health snapshot in an ambient pixel companion: it looks concerned about current red blockers, celebrates when a known blocker disappears, and treats commits as independent milestones.

For deeper analysis, the user can opt into IBM Bob Shell summaries. ContextBack passes bounded session metadata to `bob run` in Ask mode and displays a structured response. For a red blocker, a separate command previews the error, file path, and numeric project health summary, then copies a prompt for Bob IDE to inspect the repository. Bob can investigate the repository there. The extension observes the subsequent diagnostic or test result and reacts when the blocker is verified as gone.

## IBM Bob usage statement

The shipped integration calls the documented Bob Shell noninteractive CLI for optional session summaries. This path requires the user to install and authenticate Bob Shell. The blocker workflow is currently manual: preview prompt, confirm copy, paste into Bob IDE, review Bob's actions, then rerun the relevant check. There is no direct IBM Bob IDE chat API integration and no automatic agent dispatch from VS Code.

The captured Bob task summaries are in the required repository-root [bob_sessions/](../bob_sessions/) directory and described in [ibm-bob/](ibm-bob/). They show work on test coverage. Review any additional session evidence before attributing architecture, integration code, subagents, or productivity measurements to Bob.

## Demo sequence

1. Open the reproducible `demo/discount-bug` workspace. Run `npm test`; show its failing threshold test, ContextBack red thread, and Code Boy's concern state.
2. Leave and reopen the project to show the recovered session and Welcome Back card.
3. Run **Code Boy: Resolve Blocker with Bob**, review the prompt, confirm the copy, and paste it into IBM Bob. Show Bob's real response and any resulting diff.
4. Rerun the diagnostic or test. Show the same blocker identity disappearing and Code Boy celebrating.
5. Optionally run **ContextBack: Summarize Last Session**. An authenticated Bob Shell summary returned in the Linux extension-host smoke test.

Use [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [PRESENTATION.md](PRESENTATION.md) to record and present the run. Record the run end to end. If you claim time saved, measure a baseline and the product flow on the same task and state the method. Link the final video, VSIX release, and Bob evidence when they exist.

## Submission checklist

- [x] Verify the repository is publicly readable at the URL above.
- [x] Build and inspect `code-boy-1.0.10.vsix` locally.
- [ ] Upload the VSIX and add the actual download link.
- [ ] Record and link a real product demo.
- [x] Add captured IBM Bob task summary screenshots to `bob_sessions/`.
- [ ] Capture the new Bob IDE blocker-fix task summary and end-to-end recording.
- [ ] Confirm the exact submission closing time in the registered account.
