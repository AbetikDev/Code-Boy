# IBM Bob 2.0 hackathon submission draft

This is a draft based on the implemented product. Check the [current hackathon page](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon) for the final rules, deadline, required assets, and form limits before submitting.

## Project

- **Name:** Code Boy & ContextBack
- **Repository:** https://github.com/AbetikDev/Code-Boy
- **Product:** VS Code extension, TypeScript, Canvas webview, local JSON persistence, optional IBM Bob Shell CLI summaries.
- **Installable build:** Run `npm run package` to create `code-boy-1.0.0.vsix`. Upload that file to a release or the submission form before presenting it as a downloadable artifact.

## Problem and solution

Returning to a project after a break often means reconstructing the last task from recent files, failed tests, diagnostics, and git changes. ContextBack records those signals locally and shows a Welcome Back view and open threads. Code Boy reflects the same health snapshot in an ambient pixel companion: it looks concerned about current red blockers, celebrates when a known blocker disappears, and treats commits as independent milestones.

For deeper analysis, the user can opt into IBM Bob Shell summaries. ContextBack passes bounded session metadata to `bob run` in Ask mode and displays a structured response. For a red blocker, a separate command previews the error and file path, then copies a prompt for the user to paste into Bob IDE or Shell. Bob can investigate the repository there. The extension observes the subsequent diagnostic or test result and reacts when the blocker is verified as gone.

## IBM Bob usage statement

The shipped integration calls the documented Bob Shell noninteractive CLI for optional session summaries. This path requires the user to install and authenticate Bob Shell. The blocker workflow is currently manual: preview prompt, confirm copy, paste into Bob, review Bob's actions, then rerun the relevant check. There is no direct IBM Bob IDE chat API integration and no automatic agent dispatch from VS Code.

Add a factual account of how IBM Bob was used to build this project only after reviewing real Bob task sessions. Include session screenshots in [ibm-bob/](ibm-bob/) and link them here. Do not attribute architecture, code, tests, subagents, or productivity measurements to Bob without that evidence.

## Demo sequence

1. Show a current compiler error or failing recognized test. Open ContextBack threads and Code Boy's concern state.
2. Leave and reopen the project to show the recovered session and Welcome Back card.
3. Run **Code Boy: Resolve Blocker with Bob**, review the prompt, confirm the copy, and paste it into IBM Bob. Show Bob's real response and any resulting diff.
4. Rerun the diagnostic or test. Show the same blocker identity disappearing and Code Boy celebrating.
5. Optionally enable Bob summaries and run **ContextBack: Summarize Last Session** with an authenticated Bob Shell installation.

Record the run end to end. If you claim time saved, measure a baseline and the product flow on the same task and state the method. Link the final video, VSIX release, and Bob evidence when they exist.

## Submission checklist

- [x] Verify the repository is publicly readable at the URL above.
- [ ] Upload the built VSIX and add the actual download link.
- [ ] Record and link a real product demo.
- [ ] Add genuine IBM Bob session evidence.
- [ ] Confirm required assets and format against the live hackathon rules.
