# StudySync Improvements Design
**Date:** 2026-03-24
**Status:** Approved

## Overview

Extend StudySync with three major improvements: assignments within courses, a monthly calendar view, and an updated priority algorithm that factors in assignment due dates. The planner page is redesigned as a tabbed single-page app (Option C).

---

## Data Model

### New Table: `assignments`

```sql
CREATE TABLE IF NOT EXISTS assignments (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title     TEXT NOT NULL,
    due_date  TEXT NOT NULL,   -- ISO 8601 YYYY-MM-DD, validated server-side
    type      TEXT NOT NULL CHECK(type IN ('quiz', 'homework', 'project')),
    completed INTEGER NOT NULL DEFAULT 0   -- 0 = incomplete, 1 = complete
);
```

The `courses` table is unchanged. All dates (`exam_date`, `due_date`) use `YYYY-MM-DD` format throughout — server and client. The server validates that `due_date` is a parseable date before inserting.

---

## Course Colors

Course colors are assigned by `course.id % courseColors.length` (not by array index position). This is stable regardless of insertion order or API sort order. Both the Courses tab and Calendar tab use this same formula so colors are always consistent.

---

## UI — Tab Layout

The `/planner` page is redesigned with a top tab bar containing three tabs. The active tab is persisted via URL hash (`#courses`, `#calendar`, `#schedule`); navigating to the page without a hash defaults to `#courses`.

### Tab 1: Courses & Assignments (`#courses`, default)
- Left sidebar retains the "Add Course" form (name, exam date, difficulty, confidence sliders).
- Main area shows course cards. Each card has an expand/collapse toggle. Expand/collapse state is not persisted across page reloads or tab switches.
- Expanded card shows:
  - List of assignments: title, due date, type badge, completion checkbox, delete button.
  - Inline "Add Assignment" form: title (required), due date (required, validated `YYYY-MM-DD`), type dropdown (quiz / homework / project, required).
- Deleting a course removes it and all its assignments via `ON DELETE CASCADE`.

### Tab 2: Calendar (`#calendar`)
- Always opens to the **current month** on initial page load or tab switch (month state is not persisted).
- Full monthly grid (Sun–Sat columns, up to 6 rows as needed).
- Previous/next month navigation buttons with no boundary limits.
- Each day cell shows two types of chips, stacked vertically:
  - **Due date chips** — color from `course.id % courseColors.length`, labeled `[Type] CourseName` (e.g., "Quiz: Calculus"). Completed assignments shown with strikethrough text.
  - **Study schedule chips** — labeled `CourseName Xh`, color from `course.id % courseColors.length`. Only shown when the in-memory `lastScheduleData` variable is non-null (i.e., a schedule has been generated in the current session).
- **Chip overflow**: If a day cell has more than 3 chips, show the first 3 and a "+N more" label. Clicking "+N more" expands that cell inline to show all chips. Only one cell can be expanded at a time — expanding a new cell collapses the previously expanded one. Clicking "+N more" again on an already-expanded cell collapses it.
- **Outdated-schedule banner**: When an assignment's `completed` status is toggled and `lastScheduleData` is non-null, display a fixed banner at the top of the page: "Your schedule may be outdated — regenerate?" with a "Regenerate" button and an "×" dismiss button. Clicking "Regenerate" triggers schedule generation and dismisses the banner. Clicking "×" dismisses the banner without regenerating. The banner does not reappear until the next completion toggle. Only one banner is shown at a time.

### Tab 3: Schedule (`#schedule`)
- The existing day-by-day timeline view.
- "Hours per day" input and "Generate Schedule" button are located here (moved from the sidebar).
- Summary statistics (total hours, hours per subject, study days) remain below the generate button.
- The loading spinner and error notifications remain unchanged.

---

## Priority Algorithm

### Current Formula
```
priority = difficulty × (6 - confidence) / days_until_exam
```

### Updated Formula

For each course, fetch its incomplete assignments. Then:

```
incomplete_assignments = assignments where completed = 0

assignment_boost = Σ (1 / days_until_due)
                   for each assignment in incomplete_assignments
                   where (due_date - current_date).days <= 14
                   where days_until_due = max(0.5, (due_date - current_date).days)
                   (overdue assignments: days_until_due = 0.5)

base_priority = difficulty × (6 - confidence) / days_until_exam

if len(incomplete_assignments) == 0:
    priority = base_priority × 0.75
else:
    priority = base_priority + assignment_boost
```

**Key clarification**: The `0.75` multiplier applies only when `len(incomplete_assignments) == 0` — i.e., the course has no incomplete assignments at all. If a course has incomplete assignments that are all more than 14 days away, `assignment_boost = 0` but the multiplier does NOT apply (the course still has outstanding work). The two branches are determined by incomplete assignment count, not by the value of `assignment_boost`.

**Exam today**: `days_until_exam` floor of `0.5` from the existing algorithm is preserved.

All date arithmetic uses server local time (`datetime.now().date()`), consistent with the existing algorithm.

---

## API Changes

### New Endpoints

#### `GET /api/courses/<id>/assignments`
Returns all assignments for a course, ordered by `due_date ASC`.

- **200**: `[{id, course_id, title, due_date, type, completed}, ...]` (empty array if course exists but has no assignments)
- **404**: `{"error": "Course not found"}`

#### `POST /api/courses/<id>/assignments`
Adds an assignment to a course.

Request: `Content-Type: application/json`, body `{"title": "...", "due_date": "YYYY-MM-DD", "type": "quiz|homework|project"}`

- **201**: `{id, course_id, title, due_date, type, completed}` — full created object
- **400**: `{"error": "Missing required fields"}` — if any of `title`, `due_date`, `type` is absent, or body is not valid JSON
- **400**: `{"error": "Invalid due_date format"}` — if date is not parseable as `YYYY-MM-DD`
- **400**: `{"error": "Invalid type"}` — if `type` is not `quiz`, `homework`, or `project`
- **404**: `{"error": "Course not found"}`

#### `DELETE /api/assignments/<id>`
Deletes an assignment.

- **200**: `{"message": "Assignment deleted successfully"}`
- **404**: `{"error": "Assignment not found"}`

#### `PATCH /api/assignments/<id>/complete`
Sets `completed` status explicitly (idempotent).

Request: `Content-Type: application/json`, body `{"completed": 0}` or `{"completed": 1}`

- **200**: `{id, course_id, title, due_date, type, completed}` — full updated object
- **400**: `{"error": "Missing completed field"}` — if body is absent, not valid JSON, or `completed` key is missing
- **400**: `{"error": "Invalid completed value"}` — if value is not `0` or `1`
- **404**: `{"error": "Assignment not found"}`

### Updated Endpoints

**`POST /api/generate-schedule`** — fetches incomplete assignments per course and applies the new priority formula internally. Request and response shape unchanged.

**`POST /api/load-demo`** — clears courses (cascade-deletes assignments), re-seeds courses, then captures the newly generated course IDs and inserts assignments using those IDs. Demo assignments:

| Course | Title | Type | Days from today |
|--------|-------|------|-----------------|
| Calculus Exam | Problem Set 5 | homework | +3 |
| Calculus Exam | Chapter Quiz | quiz | +7 |
| Physics Final | Lab Report | homework | +4 |
| Physics Final | Midterm Review | homework | +6 |
| History Essay | Outline Draft | homework | +2 |
| Programming Project | Code Review | project | +3 |

All demo assignments are seeded as `completed = 0`.

---

## Files to Change

| File | Change |
|------|--------|
| `app.py` | Init `assignments` table; 4 new routes; updated schedule algorithm; updated demo loader |
| `templates/planner.html` | Tab bar + hash routing; Tab 1 (courses + assignments), Tab 2 (calendar), Tab 3 (schedule) |
| `static/js/app.js` | Tab switching (hash-based); assignment CRUD; calendar rendering; chip overflow; banner; `course.id`-based color assignment |
| `static/css/style.css` | Tab bar; assignment list + type badges; calendar grid + chips; "+N more" expand |
