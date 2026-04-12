# Learn With Trang — IELTS Preparation Platform

A browser-based, single-page application for IELTS exam preparation. Includes full mock tests for all four skills, targeted practice exercises, score tracking with trend charts, a real-time multiplayer live quiz, and a password-protected admin panel for complete content management.

---

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [App Sections](#app-sections)
- [Data & Storage](#data--storage)
- [Question Types](#question-types)
- [Band Score Calculation](#band-score-calculation)
- [Admin Panel Guide](#admin-panel-guide)
- [Adding Test Content](#adding-test-content)
- [Technical Notes](#technical-notes)

---

## Features

| Feature | Details |
|---|---|
| **Mock Tests** | Full IELTS sections — Reading (60 min, 40 Q), Listening (30 min, 40 Q), Writing (60 min, 2 tasks), Speaking (11–14 min, 3 parts), Full Test |
| **Listening Audio Engine** | Auto-plays sequentially across sections; 60 s break between sections; pause-locked and scrubber-free in timed mode; native player with scrubber in practice mode |
| **Practice Packages** | Beginner / Intermediate / Advanced; covers vocabulary, grammar, reading skills, writing tips, and mini quiz |
| **Score Tracking** | Multi-section trend chart; per-test band score, accuracy, time taken |
| **Timer Modes** | Countdown (auto-submit at 0, audio locked) or Elapsed (open-ended practice, full audio controls) |
| **Question Navigator** | Visual grid showing answered / flagged / current status; jump to any question |
| **Question Flagging** | Mark any question for review before submitting |
| **Live Quiz** | Real-time multiplayer quiz (Kahoot-style) with room codes, QR join, team mode, and live leaderboard |
| **Admin Panel** | Create or edit test packages, questions, audio, transcripts, practice content — all from the browser |
| **Fully Offline-capable** | No server required for the UI. Runs directly from the file system; Supabase sync is background-only |

---

## Getting Started

No build step or server required. Open the app directly in any modern browser.

```bash
# Open the landing page
open index.html

# Or open the app directly
open pages/app.html
```

> **Browser requirement:** A modern browser with ES2015+, localStorage, Canvas API, and HTML5 Audio (Chrome 90+, Firefox 90+, Safari 14+, Edge 90+).

### Admin Access

The admin panel is accessible via the **Admin** tab. Credentials are managed through Supabase Auth — contact the site owner for access. Change your password via **Admin → Change Password** after first login.

---

## Project Structure

```
TrangProject/
├── index.html                  Landing/marketing page
│
├── pages/
│   ├── app.html                Main SPA (all tabs)
│   └── change-password.html    Supabase password-reset landing
│
├── assets/
│   ├── Logo.png                Brand logo
│   └── Face.jpg                Instructor photo
│
├── database/
│   └── schema.sql              Supabase schema (6 tables)
│
├── css/
│   ├── shared.css              Global theme, CSS variables, navbar, buttons, modals
│   ├── landing.css             Landing page styles
│   ├── dashboard.css           Dashboard tab
│   ├── mock-test.css           Test interface, listening player, question types
│   ├── practice.css            Practice tab
│   ├── review.css              Score chart and history
│   ├── admin.css               Admin panel
│   └── live-quiz.css           Live quiz host/player UI
│
├── js/
│   ├── shared.js               Core state, navigation, escHtml(), confirmClearHistory(),
│   │                           rawToBand(), formatTime(), toast/modal utilities
│   ├── db.js                   Supabase client — all DB and auth operations
│   ├── auth.js                 Student authentication (Supabase)
│   ├── dashboard.js            Dashboard rendering & stats
│   ├── listening-renderer.js   All listening question-type renderers (grouped blocks,
│   │                           matching dropdowns, flow charts, maps, etc.)
│   ├── mock-test.js            Test execution engine: timer, scoring, rendering,
│   │                           listening audio state machine
│   ├── practice.js             Practice content rendering & quiz logic
│   ├── review.js               Score chart & history rendering
│   ├── admin.js                Admin panel UI & content management (CRUD, JSON import)
│   ├── live-quiz.js            Real-time multiplayer quiz via Supabase Realtime
│   ├── data-test.js            Built-in content — Cambridge IELTS 18 Test 1
│   ├── data-cam18.js           Built-in content — Cambridge IELTS 18 Tests 2–4
│   └── data-practice.js        Practice package skeleton (content managed via Admin)
│
└── Resources/
    └── Cam18/
        └── Cam18_Audio/        MP3 audio files for Cambridge IELTS 18 listening tests
```

**JS load order in `app.html` is strict:**
```
db.js → shared.js → data-*.js → dashboard.js → listening-renderer.js
  → mock-test.js → practice.js → review.js → admin.js → auth.js → live-quiz.js
```

`listening-renderer.js` must come before `mock-test.js`. `db.js` must come before `shared.js`.

---

## App Sections

### Dashboard

The home screen after launch. Displays:

- **Stats bar** — Total tests taken, practice time (hours), best band score, date of last test
- **Skill progress** — A progress bar per IELTS skill, calculated from test history
- **Quick-start buttons** — Jump directly into any section or a full test
- **Recent tests** — The 5 most recent test records

All stats are computed from localStorage history. Use **Reset All Data** (with confirmation modal) to clear everything.

---

### Mock Test

#### Selecting a Test

1. Choose a **Test Package** from the dropdown (e.g., Cambridge IELTS 18)
2. Choose a **Test** (Test 1, Test 2, …)
3. Choose a **Timer Mode**: **Countdown** (timed exam) or **Elapsed** (open practice)
4. Click a section card to start

#### Timer Modes

| Mode | Timer | Audio | Scrubber |
|---|---|---|---|
| **Countdown** | Counts down; auto-submits at 0 | Auto-plays; pause locked | Hidden (custom player) |
| **Elapsed** | Counts up; no auto-submit | Manual play/pause | Shown (native controls) |

#### Listening Audio — Timed Mode

Audio plays automatically when the test starts. Sections play sequentially:

1. Section 1 audio starts automatically
2. When Section 1 ends, a **60-second break** countdown is shown
3. After the break, Section 2 audio starts automatically — regardless of which section the student is viewing
4. Clicking questions from a previous (already-played) section does **not** restart that audio
5. Students cannot navigate forward past a section whose audio has not yet finished

#### Test Interface

- **Timer bar** — Fixed to the top. Turns yellow under 10 minutes, red under 5 minutes, pulses in the final minute.
- **Listening player bar** — Appears during listening tests. Shows section title, break countdown, and audio controls.
- **Jump-to buttons (⏱)** — Inline buttons in practice mode that seek audio to that question's timestamp.
- **Reading split pane** — Passage on the left, questions on the right, independently scrollable.
- **Question navigator** — Fixed at the bottom. Color legend: grey = unanswered, green = answered, orange = flagged.
- **Flag button** — Marks the current question for review.

#### Submitting

Click **Submit Test** → confirm in the modal. Results show:
- Overall band score (3.5–9.0), accuracy percentage, time taken
- Breakdown by question type
- Click **Save to History** to record the result

---

### Practice

Three difficulty levels: **Beginner** (Band 4–5), **Intermediate** (Band 5.5–6.5), **Advanced** (Band 7+).

Each package has five sub-tabs:

| Sub-tab | Content |
|---|---|
| **Vocabulary** | Word cards (definition, part of speech, example) + a matching quiz |
| **Grammar** | Accordion sections per topic — rule explanations + fill-in questions with instant feedback |
| **Reading Skills** | Strategy guides for skimming, scanning, inference, etc. |
| **Writing Tips** | Task 1 & Task 2 strategy breakdown with band-score badges and model answers |
| **Mini Quiz** | 20-question quiz covering vocabulary, grammar, reading, and writing |

---

### Review

- **Score Trend Chart** — Canvas line chart showing up to 10 most recent tests. Each section has its own colored line.
- **Test History** — Full list of saved tests. Click any row to expand it and see band score, correct/total, time taken, and personalized advice.
- **Practice Results** — History of mini quiz attempts with score, percentage, and band equivalent.

Use **Clear History** to delete all records (confirmation modal required).

---

### Live Quiz

Real-time multiplayer quiz powered by Supabase Realtime.

**Host flow:**
1. Go to **Live Quiz → Host**
2. Select a test package and choose questions
3. Share the room code or QR code with players
4. Start the quiz and advance questions manually
5. View the live leaderboard after each question

**Player flow:**
1. Go to **Live Quiz → Join** (or scan the QR code / use a direct link)
2. Enter the room code and your name
3. Answer each question before the timer runs out
4. View your rank on the leaderboard

Team mode is supported — players can join as a team, and scores are aggregated by team.

---

### Admin Panel

See [Admin Panel Guide](#admin-panel-guide) below.

---

## Data & Storage

All content is stored in **browser localStorage** and synced to **Supabase** in the background:

| localStorage Key | Contents |
|---|---|
| `ielts_history` | Array of up to 50 test result records, newest first |
| `hct_admin_data` | Admin-edited overrides for built-in test content |
| `hct_custom_test_pkgs` | Metadata for admin-created test packages |
| `hct_custom_tests` | Tests within custom packages |
| `hct_hidden_tests` | Built-in tests/packages the admin has hidden |
| `hct_practice_data` | Admin-edited overrides for built-in practice content |
| `hct_custom_practice_pkgs` | Admin-created practice packages |
| `hct_hidden_practice_pkgs` | Hidden built-in practice packages |

Every saved object carries a `_ts` timestamp. On startup, `syncAll()` compares local vs Supabase timestamps and keeps whichever is newer, preventing stale cloud data from overwriting recent local edits.

> Clearing browser localStorage will erase all history and admin-created content locally. Supabase remains the backup source of truth.

### Supabase Tables

| Table | Contents |
|---|---|
| `test_history` | Test results (session/user scoped, max 50 per user) |
| `app_data` | Admin content store (key-value, all localStorage keys above) |
| `profiles` | Student and admin profile records |
| `practice_results` | Mini quiz scores |
| `quiz_rooms` | Live quiz room state |
| `quiz_participants` | Live quiz player scores and answers |

---

## Question Types

| Type | Description | Scoring |
|---|---|---|
| `tfng` | True / False / Not Given | Exact match |
| `ynng` | Yes / No / Not Given | Exact match |
| `mcq` | Single-select multiple choice (A–D) | Exact letter match |
| `multi` | Multi-select, requires exactly N answers | All must match |
| `matching` | Choose from a dropdown list of options | Exact match |
| `matching_headings` | Match paragraph to heading | Exact match |
| `matching_info` / `matching_features` | Information/feature matching | Exact match |
| `short` / `sentence_completion` / `note_completion` / `summary_completion` | Type a word or phrase | Case-insensitive exact match |
| `form_completion` | Fill-in form fields | Case-insensitive exact match |
| `writing` | Free-text essay (not auto-scored) | Manually reviewed |
| `speaking` | Cue card / prompts (not auto-scored) | Manually reviewed |

**Listening-specific grouped types** (rendered as a single question block):

| Type | Layout |
|---|---|
| `map_labelling` | Image with letter-labelled prompts |
| `flow_chart` | Vertically-chained steps with fill-in inputs |
| `table_completion` | Row/column table with inline inputs |
| `note_completion` | Structured note form with fill-in fields |
| `form_completion` | Labelled form fields |

---

## Band Score Calculation

Raw score percentage → IELTS band. Same thresholds for all sections (`rawToBand()` in `shared.js`):

| Percentage | Band |
|---|---|
| ≥ 97.5% | 9.0 |
| ≥ 92.5% | 8.5 |
| ≥ 87.5% | 8.0 |
| ≥ 82.5% | 7.5 |
| ≥ 72.5% | 7.0 |
| ≥ 67.5% | 6.5 |
| ≥ 57.5% | 6.0 |
| ≥ 47.5% | 5.5 |
| ≥ 37.5% | 5.0 |
| ≥ 27.5% | 4.5 |
| ≥ 17.5% | 4.0 |
| < 17.5% | 3.5 |

Writing and Speaking are not auto-scored and are excluded from band calculation.

---

## Admin Panel Guide

Access via the **Admin** tab. Authentication is handled via Supabase Auth.

### Test Management

1. **Select a package** from the left panel (or create one with **+ New Package**)
2. **Select a test** (or create one with **+ New Test**)
3. **Select a section** (Listening / Reading / Writing / Speaking)
4. Edit content in the editor, then click **Save**

#### Listening Section Editor

- Set the **audio URL** (MP3 link or relative path from `app.html`)
- Click **Preview** to load the audio player, then scrub to any position
- Add/edit questions — for each question:
  - Set question text, type, and correct answer
  - Click **Capture ⏱** to record the current audio position as `questionStart`
  - Questions with the same `groupId` are rendered as a single block (map, table, flow chart, etc.)
- Add a **transcript** to display in practice mode (hidden in countdown/timed mode)

#### Reading Section Editor

- Add/edit passages with title and body text
- Add questions per passage with type, text, and correct answer

#### Writing & Speaking Editors

- Edit task prompts and cue cards
- Informational only — no auto-scoring

### Practice Management

Switch to **Practice Mode** at the top of the admin panel.

- Select a practice package (or create a custom one)
- Edit vocabulary cards, grammar topics, reading skill guides, writing tips, or quiz questions
- Custom packages can be deleted; built-in packages can be hidden

### Managing Packages

| Action | How |
|---|---|
| Create a test package | Click **+ New Package**, enter a name |
| Add a test | Click **+ New Test** inside a package |
| Rename a package or test | Edit the name field and click **Save Names** |
| Delete a custom package | Click **Delete Package** (irreversible for custom; hides built-in) |
| Change admin password | Bottom of the admin panel → **Change Password** |

---

## Adding Test Content

### Editing Built-in Content

The built-in data lives in `js/data-test.js` (Cambridge IELTS 18 Test 1) and `js/data-cam18.js` (Tests 2–4). You can:

1. **Edit via Admin Panel** — changes are saved to localStorage and override the file data
2. **Edit the source files directly** — modify `TEST_PACKAGES` in the data files

### Adding a New Test Package via Source

```javascript
// In js/data-test.js or js/data-cam18.js
TEST_PACKAGES['my_package'] = {
  id: 'my_package',
  name: 'My Test Package',
  tests: {
    'test1': {
      id: 'test1',
      name: 'Test 1',
      reading: {
        passages: [
          {
            id: 'p1',
            title: 'Passage Title',
            text: 'Passage body text...',
            questions: [
              { id: 'q1', qNum: 1, type: 'tfng', text: 'Statement here', answer: 'TRUE' },
              { id: 'q2', qNum: 2, type: 'mcq', text: 'Question?', options: ['A','B','C','D'], answer: 'A' }
            ]
          }
        ]
      },
      listening: {
        sections: [
          {
            id: 's1',
            title: 'Section 1',
            audioUrl: 'Resources/audio.mp3',
            transcript: 'Full transcript text...',
            questions: [
              { id: 'q10', qNum: 10, type: 'short', text: 'Fill in:', answer: 'word', questionStart: 45 }
            ]
          }
        ]
      },
      writing: {
        task1: { prompt: 'Describe the chart...', minWords: 150, rubric: [] },
        task2: { prompt: 'Discuss both views...', minWords: 250, rubric: [] }
      },
      speaking: {
        part1: { title: 'Part 1', questions: ['Tell me about...'] },
        part2: { title: 'Part 2', cueCard: { topic: '', bullets: [], note: '' } },
        part3: { title: 'Part 3', questions: [] }
      }
    }
  }
};
```

### Listening Question `questionStart`

The `questionStart` field (integer, seconds) controls the **Jump-to button** (⏱) in practice mode — clicking it seeks the audio to that timestamp. It has no effect in timed/countdown mode (audio always plays sequentially from the start).

Set it in the Admin Panel via the **Capture** button, or hardcode it in the data file (e.g., `questionStart: 47`).

### Grouped Listening Questions

Questions sharing a `groupId` are rendered as a single block. The group type is determined by the first question's `type`:

```javascript
// Map labelling example
{ id: 'q1', qNum: 1, type: 'map_labelling', groupId: 'map1', groupImage: 'map.png', xPct: 30, yPct: 45, text: 'The library', answer: 'B', questionStart: 120 },
{ id: 'q2', qNum: 2, type: 'map_labelling', groupId: 'map1', groupImage: 'map.png', xPct: 60, yPct: 20, text: 'The café',    answer: 'D' },

// Matching dropdown example — question and instruction go on the first peer
{ id: 'q5', qNum: 5, type: 'matching', groupId: 'match1', matchQuestion: 'What does each speaker think about...', instruction: 'Choose the correct letter A–E.', text: 'Speaker 1', options: ['A option','B option','C option'], answer: 'A', questionStart: 200 },
{ id: 'q6', qNum: 6, type: 'matching', groupId: 'match1', text: 'Speaker 2', options: ['A option','B option','C option'], answer: 'C' },
```

Only the first question in a group needs `questionStart`, `matchQuestion`, `instruction`, and `options`.

---

## Technical Notes

- **No framework, no build step.** Plain HTML, CSS, and JavaScript. Open `pages/app.html` in a browser and it works.
- **State** is held in the global `appState` object in `shared.js`. UI updates by calling render functions after mutations.
- **`escHtml(s)`** in `shared.js` is the single HTML-escape utility — use it for all dynamic `innerHTML` insertions.
- **CSS custom properties** (`--primary`, `--card-bg`, etc.) are defined in `shared.css`. The kawaii pink/purple theme is controlled entirely from there.
- **Responsive:** the reading split-pane and stats grid adapt below 900px; the timer bar and question navigator are always visible.
- **Audio files** for Cambridge IELTS 18 are in `Resources/Cam18/Cam18_Audio/`. Audio URLs in data files are relative paths from `pages/app.html`.
- **Cambridge IELTS 18 Tests 2–4** are wired up in `data-cam18.js` but question content is marked `TODO`.
- **Supabase** handles auth and background sync. The app degrades gracefully when offline — localStorage is always the live cache.
- **Live Quiz** uses Supabase Realtime channels for sub-second broadcast. Room cleanup runs automatically on startup (rooms older than 24 hours are deleted).
