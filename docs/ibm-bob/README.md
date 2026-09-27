# IBM Bob evidence audit

The [IBM hackathon guide](https://lablab-ibm-bob-2-hackathon-guide.s3.us.cloud-object-storage.appdomain.cloud/index.html) asks **each participant** to save screenshots of the **task session consumption summary** for every relevant Bob IDE task. In Bob IDE, open **Tasks**, select the task, then click its header to display that summary. Put the resulting PNGs in the repository-root [bob_sessions/](../../bob_sessions/).

| Capture | What is visible | Evidence status |
| --- | --- | --- |
| [task01](../../bob_sessions/codeboy_task01_coverage_summary.png) | Completed task response about test coverage and a consumption number in the header | Task work visible; the opened consumption-summary panel is not visible |
| [task02](../../bob_sessions/codeboy_task02_test_suite_summary.png) | Completed task response about added tests and a consumption number in the header | Task work visible; the opened consumption-summary panel is not visible |
| [task03 response](codeboy_task03_discount_blocker_summary.png) | Bob response listing unverified items | Not a discount-blocker repair and not a consumption-summary screenshot; retained here for audit, not copied to `bob_sessions/` as proof |

The Git history contains work by `Abetik`, `Maks0101aps`, `dersakyy`, and `sunabusan`; Git authorship does not establish the registered hackathon team roster or each person's Bob account. The repository has no Bob task captures attributed to individual participants. Before submission, check the actual roster and each participant's relevant Tasks in Bob IDE, capture the required summary panels, and record who captured each one.

The discount demo still needs a genuine continuous recording: failed test → Code Boy blocker → Bob IDE prompt and edit → passing test → blocker cleared → celebration. The [before/after timing](discount-before-after-measurement.json) is a local scripted test rehearsal, not a Bob productivity measurement.
