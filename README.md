# Learn With Trang — IELTS Preparation Platform

A browser-based, single-page application for IELTS exam preparation. Includes full mock tests for all four skills, targeted practice exercises, score tracking with trend charts, and a password-protected admin panel for complete content management.

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
| **Practice Packages** | Beginner / Intermediate / Advanced; covers vocabulary, grammar, reading skills, writing tips, and mini quiz |
| **Score Tracking** | Multi-section trend chart; per-test band score, accuracy, time taken |
| **Timer Modes** | Countdown (auto-submit at 0) or Elapsed (open-ended practice) |
| **Question Navigator** | Visual grid at the bottom of the test showing answered / flagged / current status |
| **Question Flagging** | Mark any question for review before submitting |
| **Admin Panel** | Create or edit test packages, questions, audio, transcripts, practice content — all from the browser |
| **Fully Offline** | No server required. Runs directly from the file system |

---

## Getting Started

No build step or server required. Open the app directly in any modern browser.

```
# Open the landing page
open index.html

# Or open the app directly
open app.html
```

> **Browser requirement:** A modern browser with ES2015+, localStorage, Canvas API, and HTML5 Audio (Chrome 90+, Firefox 90+, Safari 14+, Edge 90+).

### Admin Access

The admin panel is accessible via the **Admin** tab. Credentials are managed through Supabase Auth — contact the site owner for access. Change your password via **Admin → Change Password** after first login.

---

## Project Structure

```
TrangProject/
├── index.html              Landing page
│
├── pages/
│   ├── app.html            Main SPA (all tabs)
│   └── change-password.html  Password reset page
│
├── assets/
│   ├── Logo.png            Brand logo
│   └── Face.jpg            Instructor photo
│
├── database/
│   └── schema.sql          Supabase database schema (local only, gitignored)
│
├── css/
│   ├── shared.css          Global theme, variables, navbar, buttons
│   ├── landing.css         Landing page styles
│   ├── dashboard.css       Dashboard tab styles
│   ├── mock-test.css       Test interface styles
│   ├── practice.css        Practice tab styles
│   ├── review.css          Review tab styles
│   └── admin.css           Admin panel styles
│
├── js/
│   ├── shared.js           Core state, navigation, utilities, localStorage
│   ├── db.js               Supabase client wrapper
│   ├── auth.js             Student authentication (Supabase)
│   ├── dashboard.js        Dashboard rendering & stats
│   ├── mock-test.js        Test execution engine (timer, scoring, rendering)
│   ├── practice.js         Practice content rendering & quiz logic
│   ├── review.js           Score chart & history rendering
│   ├── admin.js            Admin panel UI & content management
│   ├── data-test.js        Built-in test content (Cambridge IELTS 18 Test 1)
│   ├── data-cam18.js       Additional Cambridge IELTS 18 tests (Tests 2–4)
│   └── data-practice.js    Practice package content (vocab, grammar, quiz)
│
└── Resources/
    └── Cam18/
        └── Cam18_Audio/    MP3 audio files for Cambridge IELTS 18 listening sections
```

**JS load order in `app.html` is strict:**
```
shared.js → data-*.js → dashboard.js → mock-test.js → practice.js → review.js → admin.js → auth.js
```

---

## App Sections

### Dashboard

The home screen after launch. Displays:

- **Stats bar** — Total tests taken, practice time (hours), best band score, date of last test
- **Skill progress** — A progress bar for each of the four IELTS skills, calculated from test history
- **Quick-start buttons** — Jump directly into any section or a full test
- **Recent tests** — The 5 most recent test records

All stats are computed from localStorage history. Use **Reset All Data** (with confirmation) to clear everything.

---

### Mock Test

#### Selecting a Test

1. Choose a **Test Package** (e.g., Cambridge IELTS 18) from the dropdown
2. Choose a **Test** (Test 1, Test 2, …)
3. Choose a **Timer Mode**: Countdown or Elapsed
4. Click one of the five section cards to start

#### Test Interface

- **Timer bar** — Fixed to the top. Turns yellow under 10 minutes, red under 5 minutes, and pulses in the final minute. Countdown mode auto-submits when time reaches zero.
- **Listening player bar** — Appears only during listening tests. Shows the section title, persistent audio controls, and auto-seeks to the question's assigned timestamp when you navigate to a question that has one.
- **Jump-to buttons (⏱)** — Small circular icon buttons placed inline next to each question number. Clicking one seeks the audio to that question's start timestamp.
- **Reading split pane** — Passage on the left, questions on the right, independently scrollable.
- **Question navigator** — Fixed at the bottom. Click any number to jump to that question. Color legend: grey = unanswered, green = answered, orange = flagged.
- **Flag button** — Marks the current question for review. Flagged questions appear orange in the navigator.

#### Submitting

Click **Submit Test** → confirm in the modal. Results show:
- Overall band score (3.5–9.0)
- Correct / total questions and accuracy percentage
- Time taken
- Breakdown by question type

Click **Save to History** to record the result. It will appear in the Dashboard and Review tabs.

---

### Practice

Three difficulty levels: **Beginner** (Band 4–5), **Intermediate** (Band 5.5–6.5), **Advanced** (Band 7+).

Each package has five sub-tabs:

| Sub-tab | Content |
|---|---|
| **Vocabulary** | Word cards (definition, part of speech, example) + a matching quiz |
| **Grammar** | Accordion sections per topic — rule explanations + fill-in practice questions with instant feedback |
| **Reading Skills** | Strategy guides for skimming, scanning, inference, etc. |
| **Writing Tips** | Task 1 & Task 2 strategy breakdown with band-score badges and model answers |
| **Mini Quiz** | 20-question quiz covering vocabulary, grammar, reading, and writing |

---

### Review

- **Score Trend Chart** — Canvas line chart showing up to 10 most recent tests. Each section has its own colored line. Bands 3.5–9.0 are gridded.
- **Test History** — Full list of saved tests. Click any row to expand it and see:
  - Band score, correct/total, time taken
  - Personalized advice based on your band for that section

Use **Clear History** to delete all records.

---

### Admin Panel

See [Admin Panel Guide](#admin-panel-guide) below.

---

## Data & Storage

All data is stored in **browser localStorage** under these keys:

| Key | Contents |
|---|---|
| `ielts_history` | Array of up to 50 test result records, newest first |
| `hct_admin_data` | Admin-edited overrides for built-in test content |
| `hct_custom_test_pkgs` | Metadata for admin-created test packages |
| `hct_custom_tests` | Tests within custom packages |
| `hct_hidden_tests` | Built-in tests/packages the admin has deleted |
| `hct_practice_data` | Admin-edited overrides for built-in practice content |
| `hct_custom_practice_pkgs` | Admin-created practice packages |
| `hct_hidden_practice_pkgs` | Hidden built-in practice packages |

> **Note:** Clearing browser data or localStorage will erase all history and admin-created content. Test results are also synced to Supabase when online.

---

## Question Types

| Type | Description | Scoring |
|---|---|---|
| `tfng` | True / False / Not Given | Exact match |
| `ynng` | Yes / No / Not Given | Exact match |
| `mcq` | Single-select multiple choice (A–D) | Exact letter match |
| `multi` | Multi-select, requires exactly N answers | All must match |
| `matching` | Choose from a list of options | Exact match |
| `matching_headings` | Match paragraph to heading | Exact match |
| `matching_info` / `matching_features` | Information/feature matching | Exact match |
| `short` / `sentence_completion` / `note_completion` / `summary_completion` | Type a word or phrase | Case-insensitive exact match |
| `form_completion` | Fill-in form fields | Case-insensitive exact match |
| `writing` | Free-text essay (not auto-scored) | Manually reviewed |
| `speaking` | Cue card / prompts (not auto-scored) | Manually reviewed |

**Listening-specific grouped types** (rendered as a single block):

| Type | Layout |
|---|---|
| `map_labelling` | Image with draggable pins, letter-labelled prompts |
| `flow_chart` | Vertically-chained steps with fill-in inputs |
| `table_completion` | Row/column table with inline inputs |
| `form_completion` / `note_completion` | Labelled form fields |

---

## Band Score Calculation

Raw score percentage → IELTS band (same thresholds for all sections):

| Percentage | Band |
|---|---|
| ≥ 97.5% | 9.0 |
| ≥ 92.5% | 8.5 |
| ≥ 87.5% | 8.0 |
| ≥ 82.5% | 7.5 |
| ≥ 72.5% | 7.0 |
| ≥ 62.5% | 6.5 |
| ≥ 52.5% | 6.0 |
| ≥ 42.5% | 5.5 |
| ≥ 32.5% | 5.0 |
| ≥ 27.5% | 4.5 |
| ≥ 22.5% | 4.0 |
| ≥ 17.5% | 3.5 |
| < 17.5% | 3.5 |

Writing and Speaking tasks are not auto-scored; they are excluded from band calculation.

---

## Admin Panel Guide

Access via the **Admin** tab. Authentication is handled via Supabase — contact the site owner for credentials.

### Test Management

1. **Select a package** from the left panel (or create one with **+ New Package**)
2. **Select a test** (or create one with **+ New Test**)
3. **Select a section** (Listening / Reading / Writing / Speaking)
4. Edit content in the editor that appears, then click **Save**

#### Listening Section Editor

- Set the **audio URL** for the section (MP3 link or relative file path)
- Click **Preview** to load the audio player, then seek to the desired position
- Add/edit **questions** — for each question:
  - Set question text, type, correct answer
  - Click the **Capture ⏱** button to record the current audio position as `questionStart`
  - Group questions together using a `groupId` for map/flow/table/form layouts
- Set the section **transcript** for display during the test

#### Reading Section Editor

- Add/edit **passages** with title and body text
- Add questions per passage with type, text, and correct answer

#### Writing & Speaking Editors

- Edit task prompts and cue cards
- These are informational only — no auto-scoring

### Practice Management

Switch to **Practice Mode** at the top of the admin panel.

- Select a practice package (or create a custom one)
- Edit vocabulary cards, grammar topics, reading skill guides, writing tips, or quiz questions per sub-tab
- Custom packages can be fully deleted; built-in packages can be hidden

### Managing Packages

| Action | How |
|---|---|
| Create a new test package | Click **+ New Package**, enter a name |
| Add a test to a package | Click **+ New Test** inside a package |
| Rename a package or test | Edit the name field at the top of the panel and click **Save Names** |
| Delete a custom package | Click **Delete Package** (irreversible for custom; hides for built-in) |
| Change admin password | Bottom of the admin panel → **Change Password** |

---

## Adding Test Content

### Editing Built-in Content (Cambridge IELTS 18)

The built-in data lives in `js/data-test.js` and `js/data-cam18.js`. You can:

1. **Edit via Admin Panel** — changes are saved to localStorage and override the file data
2. **Edit the source files directly** — edit `TEST_PACKAGES` in `data-test.js` / `data-cam18.js`

### Adding a New Test Package via Source

In `js/data-test.js`, extend `TEST_PACKAGES`:

```javascript
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
            body: 'Passage text...',
            questions: [
              { id: 'q1', qNum: 1, type: 'tfng', text: 'Question text', answer: 'TRUE' },
              { id: 'q2', qNum: 2, type: 'mcq', text: 'Question?', options: ['A', 'B', 'C', 'D'], answer: 'A' }
            ]
          }
        ]
      },
      listening: {
        sections: [
          {
            id: 's1',
            title: 'Section 1',
            audio: 'Resources/audio.mp3',
            transcript: 'Transcript text...',
            questions: [
              { id: 'q10', qNum: 10, type: 'short', text: 'Fill in:', answer: 'word', questionStart: 45 }
            ]
          }
        ]
      },
      writing: {
        task1: { prompt: 'Describe the chart...' },
        task2: { prompt: 'Discuss both views...' }
      },
      speaking: {
        parts: [
          { part: 1, title: 'Introduction', prompts: ['Tell me about...'] }
        ]
      }
    }
  }
};
```

### Listening Question `questionStart`

The `questionStart` field (integer, seconds) controls:
- **Auto-seek** — the audio player jumps to this timestamp when the user navigates to that question
- **Jump button** — a small ⏱ icon appears inline next to the question number; clicking it manually seeks to the timestamp

Set this in the Admin Panel using the **Capture** button while previewing the audio, or set it directly in the data file as an integer (e.g., `questionStart: 47`).

### Grouped Listening Questions

To render multiple questions as a single block (map, flow chart, table, etc.):

```javascript
{ id: 'q1', qNum: 1, type: 'map_labelling', groupId: 'map_group1', groupImage: 'map.png', xPct: 30, yPct: 45, text: 'The library', answer: 'B', questionStart: 120 },
{ id: 'q2', qNum: 2, type: 'map_labelling', groupId: 'map_group1', groupImage: 'map.png', xPct: 60, yPct: 20, text: 'The café', answer: 'D' },
```

Only the first question in a group needs `questionStart`.

---

## Technical Notes

- **No framework, no build step.** Plain HTML, CSS, and JavaScript. Open `app.html` in a browser and it works.
- **State** is held in the global `appState` object in memory. UI is updated by calling render functions after state mutations.
- **CSS custom properties** (`--primary`, `--card-bg`, etc.) are defined in `shared.css`. The full kawaii theme is controlled from there.
- **Responsive breakpoints:** the reading split-pane and stats grid adapt below 900px; the question navigator and timer bar are always visible on mobile.
- **Audio files** for Cambridge IELTS 18 are in `Resources/Cam18/Cam18_Audio/`. Audio URLs in the data files are relative paths from `app.html`.
- **Cambridge IELTS 18 Tests 2–4** are structurally wired up in `data-cam18.js` but question content is not yet filled in (marked with `TODO` comments).
- **Supabase** is used for user authentication and background data sync. The app degrades gracefully when offline.
