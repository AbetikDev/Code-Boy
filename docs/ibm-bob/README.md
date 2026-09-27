# IBM Bob evidence audit

The [IBM hackathon guide](https://lablab-ibm-bob-2-hackathon-guide.s3.us.cloud-object-storage.appdomain.cloud/index.html) asks **each participant** to save screenshots of the **task session consumption summary** for every relevant Bob IDE task. In Bob IDE, open **Tasks**, select the task, then click its header to display that summary. Put the resulting PNGs in the repository-root [bob_sessions/](../../bob_sessions/).

| Capture | What is visible | Evidence status |
| --- | --- | --- |
| [task01](../../bob_sessions/codeboy_task01_test_coverage_consumption_summary.png) | Task session consumption summary for test coverage | Consumption summary panel visible |
| [task02](../../bob_sessions/codeboy_task02_full_project_review_consumption_summary.png) | Task session consumption summary for full project review | Consumption summary panel visible |

The Git history contains work by `Abetik`, `Maks0101aps`, `dersakyy`, and `sunabusan`; Git authorship does not establish the registered hackathon team roster or each person's Bob account. The repository has no Bob task captures attributed to individual participants. Before submission, check the actual roster and each participant's relevant Tasks in Bob IDE, capture the required summary panels, and record who captured each one.

The discount demo still needs a genuine continuous recording: failed test → Code Boy blocker → Bob IDE prompt and edit → passing test → blocker cleared → celebration. The [before/after timing](discount-before-after-measurement.json) is a local scripted test rehearsal, not a Bob productivity measurement.

## IBM Bob Setup in Code Boy

Code Boy configures IBM Bob without requiring `.env` files or manual environment exports:
1. Open Code Boy in the VS Code Activity Bar.
2. Click **IBM BOB API KEY** (or run `ContextBack: Connect IBM Bob API Key`).
3. Follow the built-in guide:
   - Log into [bob.ibm.com](https://bob.ibm.com/docs/shell/account/api-keys).
   - Under Account / Subscription Settings, open **API Keys**.
   - Create an **Inference** key and copy it immediately.
   - Paste the key into Code Boy and click **Save & Scan**.
4. The key is securely stored in **VS Code SecretStorage** and is encrypted locally on the developer's device. No `.env` file is used or needed.
5. In the ContextBack tab, click **↻ SCAN AGAIN** to run an on-demand code review through the Bob Shell CLI. The UI indicates active scanning progress and displays scores, rationale, and observations directly in the panel.

