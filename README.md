# Code Boy & ContextBack

> **The Ambient Flow & Intelligent Context Recovery Dev Companion for VS Code**  
> *Built for the **IBM Bob 2.0 Hackathon** on [lablab.ai](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon)*

[![IBM Bob 2.0 Hackathon](https://img.shields.io/badge/IBM%20Bob%202.0-Hackathon%20Project-blue?style=for-the-badge&logo=ibm)](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.96.0-007ACC.svg?style=for-the-badge&logo=visual-studio-code)](https://code.visualstudio.com/)
[![Tests](https://img.shields.io/badge/Tests-58%20Passed-brightgreen.svg?style=for-the-badge)](test/)
[![Core Coverage](https://img.shields.io/badge/Coverage-%3E90%25%20Core-blue?style=for-the-badge)](docs/TESTING_REPORT.md)
[![Runtime Dependencies](https://img.shields.io/badge/Dependencies-0%20npm%20runtime-success.svg?style=for-the-badge)](package.json)

---

## 💡 The Problem: The High Cost of Context Switching

Every developer knows the friction of returning to an IDE after a meeting, overnight break, or weekend:
* **"Where was I?"** It takes an average of **23+ minutes** to regain deep focus after every interruption.
* **Invisible Blockers:** Forgotten compiler errors, failing unit tests, and loose TODOs/FIXMEs get lost in git diff noise.
* **Onboarding & Branch Friction:** Switching between complex feature branches causes mental fatigue and cognitive overload.
* **Dry Tools:** Existing productivity trackers are either passive timesheets or terminal dumps that offer no interactive engagement.

---

## 🚀 The Solution: Two Powerful Engines in One Extension

**Code Boy & ContextBack** combines **autonomous developer context tracking** and **agentic IBM Bob 2.0 intelligence** with a **delightful ambient visual companion**:

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                           VS Code Workspace                            │
 └───────────────────┬────────────────────────────────┬───────────────────┘
                     │                                │
         [ Local Activity Stream ]         [ Ambient UI Interaction ]
                     │                                │
                     ▼                                ▼
       ┌───────────────────────────┐    ┌───────────────────────────┐
       │     ContextBack Engine    │    │      Code Boy Canvas      │
       │                           │    │                           │
       │ • File & Git Collectors   │    │ • 60 FPS Pixel Art Engine │
       │ • Diagnostics Tracker     │◄───┤ • Real-time Flow Feedback │
       │ • Terminal & TODO Scanner │    │ • Vibe Coding & Music     │
       │ • Thread Detector (R/Y/G) │    │ • Gamified Focus & Levels │
       └─────────────┬─────────────┘    └───────────────────────────┘
                     │
                     ▼
       ┌───────────────────────────────────────────────────────────┐
       │               IBM Bob 2.0 Agentic Partner                 │
       │                                                           │
       │  • Repository-Wide Context Analysis                       │
       │  • Intelligent Session Summarization & Next Steps         │
       │  • 1-Click Handoff: Package & Dispatch to IBM Bob Agent   │
       └───────────────────────────────────────────────────────────┘
```

### 1. 🧠 ContextBack: Zero-Friction Developer Continuity
* **Continuous Local Tracking:** Monitors active files, branch checkouts, compiler diagnostics, and terminal exit codes with **zero runtime npm dependencies**.
* **Welcome Back Card:** Reconstructs your working memory immediately upon returning to the editor. Shows what was accomplished, hot files, and open errors.
* **Open Thread Detection:** Categorizes unfinished tasks with deterministic traffic-light signals (🔴 Red: Broken compiler/tests, 🟡 Yellow: Uncommitted edits/TODOs, 🟢 Green: Ready to commit).
* **Privacy-First & Secure:** Source code and sensitive keys (`.env`, secrets, credentials) are **never exported**. Only localized operational metadata is processed.

### 2. 🤖 Powered by IBM Bob 2.0
* **Repository-Aware Synthesis:** Leverages IBM Bob 2.0's full-repo comprehension to summarize sessions and recommend actionable **Next Steps**.
* **1-Click Agent Handoff:** Instantly formats open error traces, affected files, and diagnostic contexts into an optimized prompt for **IBM Bob Agent mode**, allowing Bob's subagents to resolve complex bugs autonomously.
* **Architected with Bob:** IBM Bob was used to design the decoupled event-bus collector architecture and verify test boundaries across 34 automated unit tests.

### 3. 🎮 Code Boy: Ambient Living Companion
* **Flow State Reflection:** Sits unobtrusively in your VS Code sidebar. Types fast when you code, enters deep focus when uninterrupted, listens to music with you, and alerts you when builds fail.
* **Vibe Mode:** Click **VIBE** to put on headphones, dim distractions, and enter calm coding mode.
* **Cosmetic Progression:** Earn XP for clean coding sessions, fixed errors, and build successes to unlock retro themes (Forest, Cyber, Retro PC, Space) and desk items (Coffee, Posters, RGB setups).

---

## ⚡ Quick Start

### Prerequisites
* **Node.js 22+**
* **VS Code 1.96+**

### Running in Development Host

```sh
# 1. Install dependencies
npm install

# 2. Compile TypeScript & bundle webview
npm run compile

# 3. Press F5 in VS Code (Run Code Boy)
```

In the **[Extension Development Host]** window:
* Click the **Code Boy** icon on the Activity Bar or press `Ctrl+Shift+P` → **`Code Boy: Open`**.
* Open the **ContextBack** sidebar from the Activity Bar (`contextback.sidebar`) to view active session telemetry and open threads.

### Installing Prebuilt VSIX

Download `code-boy-1.0.0.vsix` or package it locally:
```sh
npm run package
```
In VS Code: Extensions view (`Ctrl+Shift+X`) → Click `...` menu → **Install from VSIX...** → Select `code-boy-1.0.0.vsix`.

---

## 🏆 IBM Bob 2.0 Hackathon Submission Deliverables

Complete hackathon documentation and verification artifacts are located in the [`docs/`](docs/) directory:

* 📄 **[Official Submission Kit](docs/SUBMISSION_KIT.md):** Contains the official **Problem & Solution Statement** (≤ 500 words), **IBM Bob Usage Statement** (≤ 500 words), **3-Minute Video Script** (with 105s live demo), and **Pitch Deck outline**.
* 📸 **[IBM Bob Task Session Screenshots](docs/ibm-bob/):** Verification screenshots showcasing IBM Bob 2.0 task executions and agent interactions during development.

---

## 🛠 Available Commands

### ContextBack (Workflow & Continuity)
| Command | Palette Title | Purpose |
| :--- | :--- | :--- |
| `contextBack.openDashboard` | **ContextBack: Open Dashboard** | Open the full session and open-threads overview |
| `contextBack.continueSession` | **ContextBack: Continue Last Session** | Reopen hot files, restore branch, and highlight pending errors |
| `contextBack.summarizeSession`| **ContextBack: Summarize Last Session**| Trigger AI/IBM Bob session summarization |
| `contextBack.showOpenThreads` | **ContextBack: Show Open Threads** | View all red/yellow unresolved task threads |
| `contextBack.pauseTracking`   | **ContextBack: Pause Tracking** | Temporarily pause local telemetry collection |
| `contextBack.clearHistory`    | **ContextBack: Clear Project History** | Purge local session history for the current workspace |

### Code Boy (Ambient Companion)
| Command | Palette Title | Purpose |
| :--- | :--- | :--- |
| `codeBoy.open` | **Code Boy: Open** | Focus companion in the sidebar |
| `codeBoy.toggleVibeMode` | **Code Boy: Toggle Vibe Mode** | Toggle headphones & chill flow mode |
| `codeBoy.pet` | **Code Boy: Pet** | Interactive click / mood boost |
| `codeBoy.dance` | **Code Boy: Dance** | Celebrate build or test milestones |
| `codeBoy.changeRoom` | **Code Boy: Change Room** | Select unlocked themes (Cyber, Forest, Retro PC, Space) |
| `codeBoy.showStats` | **Code Boy: Show Stats** | Display coding hours, level, streak, and XP |

---

## 🔒 Privacy & Local Security

* **Zero Code Exfiltration:** Your proprietary code never leaves your machine. Telemetry only tracks event counters, filenames, line numbers, and error messages.
* **Sensitive File Exclusion:** Files matching `.env*`, `**/secrets/**`, `**/*.pem`, and `**/*.key` are strictly ignored by collectors.
* **Safe Local Storage:** Data is stored strictly on your local filesystem under `~/.contextback/` and VS Code `globalState`.

---

## 🧪 Testing & Code Quality

```sh
npm run check       # Strict TypeScript typechecking for host & webview
npm test            # Run 40 unit tests (state machine, collectors, persistence, CSP)
npm run test:host   # Integration run in real VS Code host
npm run preview     # Webview interface preview at http://127.0.0.1:4173
```

All 40 test suites pass in sub-second time with 100% deterministic coverage (see full [QA Report](docs/TESTING_REPORT.md)):
```
✔ coding transitions do not restart for every keystroke, and idle starts at 30 seconds
✔ Database initializes clean state and survives atomic disk flush & reload
✔ ThreadDetector flags broken diagnostics as RED and open TODOs as YELLOW
✔ SessionAnalyzer synthesizes completed tasks, open blockers, and nextStep
✔ End-to-end ContextBack core lifecycle: start -> work -> error -> resolve -> end
...
ℹ pass 40, fail 0 (238ms)
```

---

## 📜 License

MIT License. Designed and developed for the **IBM Bob 2.0 Hackathon (2026)**.
