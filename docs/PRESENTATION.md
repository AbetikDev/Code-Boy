# Code Boy & ContextBack — presentation draft

## 1. The problem

After a context switch, developers reconstruct what broke from terminals, diagnostics, TODOs, and unfinished edits. A companion that only reacts to keystrokes misses the project state.

## 2. The product

Code Boy is a VS Code pixel companion; ContextBack remembers local session signals. The new Developer Intelligence Layer shows Coding, Project health, Craft, Tests, and Music in one compact panel.

## 3. How it works

The editor sends numeric edit metadata to a five-minute behavior analyzer. Diagnostics, recognized tests, tasks, and ContextBack threads feed a project quality snapshot. One large insertion is neutral; repeated large insertions change the editing-pattern label. The label says nothing about authorship.

## 4. Bob IDE workflow

A red blocker produces a prompt with its error context and numeric project summary. Bob IDE inspects the repository and applies a fix. Rerunning the check removes the known blocker; Code Boy reacts once. The reproducible discount-threshold example lives in `demo/discount-bug`.

## 5. Privacy and control

Developer state stores only counts and statuses. ContextBack separately keeps local session records and optional diff snapshots; enabling Bob Shell review can send bounded samples to IBM Bob. Music providers read playback status only, with a manual fallback.

## 6. Verification

Linux build: TypeScript check passed; 236 Node tests passed; 9 browser tests passed; VS Code extension-host smoke passed; VSIX packaged. Live macOS playback and Windows smoke remain to be verified on those machines. A live Bob IDE blocker-fix recording is the final demo proof.

## 7. Ask

Try the VSIX, reproduce the demo blocker, and inspect the real Bob IDE task summary and passing test in the video. The product is a working prototype, with a future read-only MCP adapter planned over the current state getters.
