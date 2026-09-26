# IBM Bob 2.0 Task Session Verification & Evidence

This directory holds the mandatory verification artifacts required for the **IBM Bob 2.0 Hackathon** on **lablab.ai**.

According to the official rules:
> *"Your repository must include the code/files where IBM Bob assisted, plus IBM Bob task session summary screenshots from each team member."*

---

## Required Screenshots Checklist

Please place your session summary screenshots in this directory with the following naming convention:

| File Name | Purpose / Session Topic | Team Member | Status |
| :--- | :--- | :--- | :--- |
| `01-bob-repo-architecture.png` | Initial codebase exploration, event bus & collector pipeline architecture | AbetikDev | ⏳ Ready to drop |
| `02-bob-thread-detection.png` | Generating heuristics for `ThreadDetector.ts` and `SessionAnalyzer.ts` | AbetikDev | ⏳ Ready to drop |
| `03-bob-agent-dispatch.png` | Designing the IBM Bob Agent prompt serialization & context recovery | AbetikDev | ⏳ Ready to drop |
| `04-bob-test-automation.png` | Verifying unit test coverage and edge case handling across collectors | AbetikDev | ⏳ Ready to drop |

---

## How to Export & Capture from IBM Bob

1. **Session Summary View**:
   - Open your IBM Bob workspace session.
   - Expand the completed task log showing the prompt, subagents spawned, files inspected, and generated diffs.
   - Capture a high-resolution screenshot displaying the session ID, timestamp, and summary.

2. **Save & Commit**:
   - Save the images directly into `docs/ibm-bob/`.
   - Commit and push to your public GitHub repository before the submission deadline:
     ```sh
     git add docs/ibm-bob/
     git commit -m "docs: add IBM Bob 2.0 task session summary screenshots"
     git push origin main
     ```

3. **Verify Links**:
   - Ensure the image markdown links in [SUBMISSION_KIT.md](../SUBMISSION_KIT.md) and [README.md](../../README.md) point directly to these files.
