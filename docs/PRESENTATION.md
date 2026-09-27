# Code Boy & ContextBack — presentation draft

## 1. The problem

After a context switch, developers reconstruct what broke from terminals, diagnostics, TODOs, and unfinished edits. A companion that only reacts to keystrokes misses the project state.

## 2. The product

Code Boy is a VS Code pixel companion; ContextBack remembers local session signals. The new Developer Intelligence Layer shows Coding, Project health, Craft, Tests, and Music in one compact panel.

## 3. How it works

The editor sends numeric edit metadata to a five-minute behavior analyzer. Diagnostics, recognized tests, tasks, and ContextBack threads feed a project quality snapshot. One large insertion is neutral; repeated large insertions change the editing-pattern label. The label says nothing about authorship.

## 4. Bob IDE workflow

A red blocker produces a prompt with its error context and numeric project summary. Bob IDE can inspect the repository and apply a fix. Rerunning the check removes the known blocker; Code Boy reacts once. The discount-threshold fixture in `demo/discount-bug` is fixed and passing; use a disposable copy with the comparison temporarily reverted for the continuous Bob IDE demo. That recording has not yet been captured.

## 5. Privacy and control

Developer state stores only counts and statuses. ContextBack separately keeps local session records and optional diff snapshots; enabling Bob Shell review can send bounded samples to IBM Bob. Music providers read playback status only, with a manual fallback.

## 6. Verification

Current Windows build: TypeScript check passed; 267 Node tests and 11 browser tests passed; VS Code extension-host and clean-profile VSIX smoke tests passed. The [downloadable VSIX](https://raw.githubusercontent.com/AbetikDev/Code-Boy/download-vsix-1.0.10/downloads/code-boy-1.0.10.vsix) was downloaded again and matched the local SHA-256. A disposable discount fixture produced 1 failing test before the threshold fix and 2 passing tests after it; the test runs took 107.01 ms and 107.73 ms respectively, with 215.33 ms for the scripted fail-to-pass sequence. These timings do not measure Bob or human repair time. Live macOS music playback and the continuous Bob IDE blocker-fix recording remain unverified.

## 7. Ask

Try the [VSIX](https://raw.githubusercontent.com/AbetikDev/Code-Boy/download-vsix-1.0.10/downloads/code-boy-1.0.10.vsix) and reproduce the demo blocker. The final submission needs the continuous Bob IDE recording and the task session consumption summaries for all relevant tasks and team participants. The product is a working prototype, with a future read-only MCP adapter planned over the current state getters.
