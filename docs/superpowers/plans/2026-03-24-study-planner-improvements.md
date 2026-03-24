# StudySync Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add assignments to courses, a monthly calendar view, and update the scheduling algorithm to factor in assignment due dates, with a tabbed UI redesign.

**Architecture:** Backend-first — extend Flask/SQLite with new endpoints and updated algorithm, then rebuild the frontend in layers: HTML structure → CSS → JavaScript. Each backend task is test-driven with pytest; frontend tasks use manual browser verification steps.

**Tech Stack:** Python 3.13, Flask 3.0.0, SQLite, pytest + pytest-flask (new), vanilla JS, HTML/CSS

**Spec:** `docs/superpowers/specs/2026-03-24-study-planner-improvements-design.md`

---

## File Map

| File | Role |
|------|------|
| `app.py` | Flask app — add assignments table, 4 new API routes, updated algorithm, updated demo loader, foreign key pragma |
| `templates/planner.html` | Full redesign — tab bar + 3 tab panels |
| `static/js/app.js` | Add tab switching, assignment CRUD, calendar rendering, course.id-based colors, outdated-schedule banner |
| `static/css/style.css` | Add tab bar, assignment list, type badges, calendar grid, chip styles, banner styles |
| `requirements.txt` | Add `pytest` and `pytest-flask` |
| `tests/conftest.py` | Pytest fixtures — isolated test DB per test |
| `tests/test_assignments.py` | Tests for all 4 new assignment API routes |
| `tests/test_schedule.py` | Tests for the updated priority algorithm |

---

## Task 1: Set Up Test Infrastructure

**Files:**
- Modify: `requirements.txt`
- Create: `tests/conftest.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Add pytest dependencies to requirements.txt**

```
Flask==3.0.0
pytest==8.3.5
pytest-flask==1.3.0
```

- [ ] **Step 2: Install dependencies**

```bash
source venv/bin/activate && pip install pytest pytest-flask
```

Expected: both packages install successfully.

- [ ] **Step 3: Create `tests/__init__.py`**

Empty file — makes `tests/` a package.

```python
```

- [ ] **Step 4: Create `tests/conftest.py`**

```python
import pytest
import os
import app as app_module


@pytest.fixture
def client(monkeypatch, tmp_path):
    """Provides a Flask test client with an isolated temporary SQLite database."""
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(app_module, 'DATABASE', db_path)
    app_module.init_db()
    app_module.app.config['TESTING'] = True
    with app_module.app.test_client() as client:
        yield client
```

- [ ] **Step 5: Verify pytest discovers the fixture**

```bash
source venv/bin/activate && pytest tests/ --collect-only
```

Expected: `<Module tests/conftest.py>` shown, no errors.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt tests/__init__.py tests/conftest.py
git commit -m "chore: add pytest test infrastructure"
```

---

## Task 2: Add Assignments Table and Foreign Key Enforcement

**Files:**
- Modify: `app.py` — `get_db_connection()` and `init_db()`

- [ ] **Step 1: Write a failing test to confirm assignments table doesn't exist yet**

Create `tests/test_assignments.py`:

```python
import pytest


def test_assignments_table_exists(client):
    """Assignments table should exist after init_db."""
    import app as app_module
    import sqlite3
    conn = sqlite3.connect(app_module.DATABASE)
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='assignments'"
    )
    result = cursor.fetchone()
    conn.close()
    assert result is not None, "assignments table should exist"


def test_foreign_keys_enforced(client):
    """Inserting an assignment with a nonexistent course_id should fail."""
    import app as app_module
    import sqlite3
    conn = sqlite3.connect(app_module.DATABASE)
    conn.execute('PRAGMA foreign_keys = ON')
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO assignments (course_id, title, due_date, type) VALUES (999, 'X', '2026-04-01', 'quiz')"
        )
        conn.commit()  # IntegrityError is raised at commit time, not execute time
    conn.close()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
source venv/bin/activate && pytest tests/test_assignments.py::test_assignments_table_exists tests/test_assignments.py::test_foreign_keys_enforced -v
```

Expected: FAIL — `assignments` table does not exist.

- [ ] **Step 3: Add foreign key pragma to `get_db_connection()` in `app.py`**

```python
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn
```

- [ ] **Step 4: Add assignments table to `init_db()` in `app.py`**

Add after the existing `CREATE TABLE IF NOT EXISTS courses` block:

```python
    conn.execute('''
        CREATE TABLE IF NOT EXISTS assignments (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title     TEXT NOT NULL,
            due_date  TEXT NOT NULL,
            type      TEXT NOT NULL CHECK(type IN ('quiz', 'homework', 'project')),
            completed INTEGER NOT NULL DEFAULT 0
        )
    ''')
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
source venv/bin/activate && pytest tests/test_assignments.py::test_assignments_table_exists tests/test_assignments.py::test_foreign_keys_enforced -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app.py tests/test_assignments.py
git commit -m "feat: add assignments table with foreign key enforcement"
```

---

## Task 3: GET and POST Assignment Endpoints

**Files:**
- Modify: `app.py` — add two new routes
- Modify: `tests/test_assignments.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_assignments.py`:

```python
def test_get_assignments_empty(client):
    """GET assignments for a course with no assignments returns empty list."""
    # First create a course
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    courses = client.get('/api/courses').get_json()
    course_id = courses[0]['id']

    resp = client.get(f'/api/courses/{course_id}/assignments')
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_get_assignments_course_not_found(client):
    resp = client.get('/api/courses/999/assignments')
    assert resp.status_code == 404
    assert 'error' in resp.get_json()


def test_add_assignment_success(client):
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    course_id = client.get('/api/courses').get_json()[0]['id']

    resp = client.post(f'/api/courses/{course_id}/assignments', json={
        'title': 'Problem Set 1',
        'due_date': '2026-04-10',
        'type': 'homework'
    })
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['title'] == 'Problem Set 1'
    assert data['type'] == 'homework'
    assert data['completed'] == 0
    assert 'id' in data


def test_add_assignment_missing_fields(client):
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    course_id = client.get('/api/courses').get_json()[0]['id']

    resp = client.post(f'/api/courses/{course_id}/assignments', json={'title': 'X'})
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'Missing required fields'


def test_add_assignment_invalid_type(client):
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    course_id = client.get('/api/courses').get_json()[0]['id']

    resp = client.post(f'/api/courses/{course_id}/assignments', json={
        'title': 'X', 'due_date': '2026-04-10', 'type': 'exam'
    })
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'Invalid type'


def test_add_assignment_invalid_date(client):
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    course_id = client.get('/api/courses').get_json()[0]['id']

    resp = client.post(f'/api/courses/{course_id}/assignments', json={
        'title': 'X', 'due_date': 'not-a-date', 'type': 'quiz'
    })
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'Invalid due_date format'


def test_add_assignment_course_not_found(client):
    resp = client.post('/api/courses/999/assignments', json={
        'title': 'X', 'due_date': '2026-04-10', 'type': 'quiz'
    })
    assert resp.status_code == 404


def test_get_assignments_ordered_by_date(client):
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    course_id = client.get('/api/courses').get_json()[0]['id']

    client.post(f'/api/courses/{course_id}/assignments', json={
        'title': 'Later', 'due_date': '2026-05-01', 'type': 'quiz'
    })
    client.post(f'/api/courses/{course_id}/assignments', json={
        'title': 'Earlier', 'due_date': '2026-04-01', 'type': 'homework'
    })

    assignments = client.get(f'/api/courses/{course_id}/assignments').get_json()
    assert assignments[0]['title'] == 'Earlier'
    assert assignments[1]['title'] == 'Later'
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
source venv/bin/activate && pytest tests/test_assignments.py -k "get_assignments or add_assignment" -v
```

Expected: FAIL — routes do not exist (404).

- [ ] **Step 3: Implement GET and POST routes in `app.py`**

Add after the existing `/api/courses/<int:course_id>` DELETE route:

```python
@app.route('/api/courses/<int:course_id>/assignments', methods=['GET'])
def get_assignments(course_id):
    conn = get_db_connection()
    course = conn.execute('SELECT id FROM courses WHERE id = ?', (course_id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Course not found'}), 404
    assignments = conn.execute(
        'SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC',
        (course_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(a) for a in assignments])


@app.route('/api/courses/<int:course_id>/assignments', methods=['POST'])
def add_assignment(course_id):
    data = request.get_json()
    if not data or not all(k in data for k in ['title', 'due_date', 'type']):
        return jsonify({'error': 'Missing required fields'}), 400
    if data['type'] not in ('quiz', 'homework', 'project'):
        return jsonify({'error': 'Invalid type'}), 400
    try:
        datetime.strptime(data['due_date'], '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Invalid due_date format'}), 400

    conn = get_db_connection()
    course = conn.execute('SELECT id FROM courses WHERE id = ?', (course_id,)).fetchone()
    if not course:
        conn.close()
        return jsonify({'error': 'Course not found'}), 404

    cursor = conn.execute(
        'INSERT INTO assignments (course_id, title, due_date, type, completed) VALUES (?, ?, ?, ?, 0)',
        (course_id, data['title'], data['due_date'], data['type'])
    )
    conn.commit()
    assignment_id = cursor.lastrowid
    conn.close()

    return jsonify({
        'id': assignment_id,
        'course_id': course_id,
        'title': data['title'],
        'due_date': data['due_date'],
        'type': data['type'],
        'completed': 0
    }), 201
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
source venv/bin/activate && pytest tests/test_assignments.py -k "get_assignments or add_assignment" -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app.py tests/test_assignments.py
git commit -m "feat: add GET and POST assignment endpoints"
```

---

## Task 4: DELETE and PATCH Assignment Endpoints

**Files:**
- Modify: `app.py`
- Modify: `tests/test_assignments.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_assignments.py`:

```python
def _make_course_and_assignment(client):
    """Helper: create a course and one assignment, return (course_id, assignment_id)."""
    client.post('/api/add-course', json={
        'name': 'Math', 'exam_date': '2026-12-01', 'difficulty': 3, 'confidence': 3
    })
    course_id = client.get('/api/courses').get_json()[0]['id']
    resp = client.post(f'/api/courses/{course_id}/assignments', json={
        'title': 'HW1', 'due_date': '2026-04-10', 'type': 'homework'
    })
    return course_id, resp.get_json()['id']


def test_delete_assignment_success(client):
    _, assignment_id = _make_course_and_assignment(client)
    resp = client.delete(f'/api/assignments/{assignment_id}')
    assert resp.status_code == 200
    assert 'message' in resp.get_json()


def test_delete_assignment_not_found(client):
    resp = client.delete('/api/assignments/999')
    assert resp.status_code == 404
    assert resp.get_json()['error'] == 'Assignment not found'


def test_patch_complete_success(client):
    _, assignment_id = _make_course_and_assignment(client)
    resp = client.patch(f'/api/assignments/{assignment_id}/complete', json={'completed': 1})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['completed'] == 1
    assert data['id'] == assignment_id


def test_patch_complete_idempotent(client):
    """Setting completed=1 twice should still return completed=1."""
    _, assignment_id = _make_course_and_assignment(client)
    client.patch(f'/api/assignments/{assignment_id}/complete', json={'completed': 1})
    resp = client.patch(f'/api/assignments/{assignment_id}/complete', json={'completed': 1})
    assert resp.status_code == 200
    assert resp.get_json()['completed'] == 1


def test_patch_complete_missing_field(client):
    _, assignment_id = _make_course_and_assignment(client)
    resp = client.patch(f'/api/assignments/{assignment_id}/complete', json={})
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'Missing completed field'


def test_patch_complete_no_body(client):
    _, assignment_id = _make_course_and_assignment(client)
    resp = client.patch(f'/api/assignments/{assignment_id}/complete')
    assert resp.status_code == 400


def test_patch_complete_invalid_value(client):
    _, assignment_id = _make_course_and_assignment(client)
    resp = client.patch(f'/api/assignments/{assignment_id}/complete', json={'completed': 2})
    assert resp.status_code == 400
    assert resp.get_json()['error'] == 'Invalid completed value'


def test_patch_complete_not_found(client):
    resp = client.patch('/api/assignments/999/complete', json={'completed': 1})
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
source venv/bin/activate && pytest tests/test_assignments.py -k "delete_assignment or patch_complete" -v
```

Expected: FAIL — routes do not exist.

- [ ] **Step 3: Implement DELETE and PATCH routes in `app.py`**

```python
@app.route('/api/assignments/<int:assignment_id>', methods=['DELETE'])
def delete_assignment(assignment_id):
    conn = get_db_connection()
    result = conn.execute('DELETE FROM assignments WHERE id = ?', (assignment_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        return jsonify({'error': 'Assignment not found'}), 404
    return jsonify({'message': 'Assignment deleted successfully'}), 200


@app.route('/api/assignments/<int:assignment_id>/complete', methods=['PATCH'])
def complete_assignment(assignment_id):
    data = request.get_json()
    if not data or 'completed' not in data:
        return jsonify({'error': 'Missing completed field'}), 400
    if data['completed'] not in (0, 1):
        return jsonify({'error': 'Invalid completed value'}), 400

    conn = get_db_connection()
    result = conn.execute(
        'UPDATE assignments SET completed = ? WHERE id = ?',
        (data['completed'], assignment_id)
    )
    conn.commit()
    if result.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Assignment not found'}), 404
    assignment = conn.execute('SELECT * FROM assignments WHERE id = ?', (assignment_id,)).fetchone()
    conn.close()
    return jsonify(dict(assignment)), 200
```

- [ ] **Step 4: Run all assignment tests**

```bash
source venv/bin/activate && pytest tests/test_assignments.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app.py tests/test_assignments.py
git commit -m "feat: add DELETE and PATCH assignment endpoints"
```

---

## Task 5: Update Schedule Algorithm with Assignment Boost

**Files:**
- Modify: `app.py` — `generate_optimized_schedule()`
- Create: `tests/test_schedule.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_schedule.py`:

```python
import pytest
from datetime import datetime, timedelta


def _today_plus(days):
    return (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')


def _setup_course(client, name='Math', difficulty=3, confidence=3, exam_days=30):
    resp = client.post('/api/add-course', json={
        'name': name,
        'exam_date': _today_plus(exam_days),
        'difficulty': difficulty,
        'confidence': confidence
    })
    return client.get('/api/courses').get_json()[-1]['id']


def test_schedule_still_generates_without_assignments(client):
    """Existing schedule generation should still work when there are no assignments."""
    _setup_course(client)
    resp = client.post('/api/generate-schedule', json={'available_hours': 4})
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'schedule' in data
    assert len(data['schedule']) > 0


def test_zero_incomplete_assignments_reduces_priority(client):
    """Course with zero incomplete assignments gets 0.75x base priority vs one with assignments."""
    # Two identical courses — one with a completed assignment, one with none
    id1 = _setup_course(client, name='CourseA', difficulty=4, confidence=2, exam_days=10)
    id2 = _setup_course(client, name='CourseB', difficulty=4, confidence=2, exam_days=10)

    # Add a completed assignment to CourseA (so it has 0 incomplete)
    resp = client.post(f'/api/courses/{id1}/assignments', json={
        'title': 'Done', 'due_date': _today_plus(5), 'type': 'quiz'
    })
    assignment_id = resp.get_json()['id']
    client.patch(f'/api/assignments/{assignment_id}/complete', json={'completed': 1})

    # CourseB has an incomplete assignment due in 7 days
    client.post(f'/api/courses/{id2}/assignments', json={
        'title': 'Pending', 'due_date': _today_plus(7), 'type': 'homework'
    })

    resp = client.post('/api/generate-schedule', json={'available_hours': 4})
    data = resp.get_json()
    summary = data['summary']['hours_per_subject']

    # CourseB (with pending assignment) should have >= hours than CourseA (no pending)
    assert summary.get('CourseB', 0) >= summary.get('CourseA', 0)


def test_assignment_boost_increases_hours_for_urgent_course(client):
    """Course with assignment due within 14 days gets more hours than equivalent course without."""
    id_boosted = _setup_course(client, name='Urgent', difficulty=3, confidence=3, exam_days=20)
    id_plain = _setup_course(client, name='Plain', difficulty=3, confidence=3, exam_days=20)

    # Add an assignment due in 3 days to Urgent course
    client.post(f'/api/courses/{id_boosted}/assignments', json={
        'title': 'Quiz tomorrow', 'due_date': _today_plus(3), 'type': 'quiz'
    })
    # Plain course has an incomplete assignment due in 30 days (outside the 14-day window)
    client.post(f'/api/courses/{id_plain}/assignments', json={
        'title': 'Far away', 'due_date': _today_plus(30), 'type': 'homework'
    })

    resp = client.post('/api/generate-schedule', json={'available_hours': 4})
    data = resp.get_json()
    summary = data['summary']['hours_per_subject']

    assert summary.get('Urgent', 0) >= summary.get('Plain', 0)
```

- [ ] **Step 2: Run tests to confirm they fail (or partially fail)**

```bash
source venv/bin/activate && pytest tests/test_schedule.py -v
```

Expected: `test_schedule_still_generates_without_assignments` may pass, others should FAIL.

- [ ] **Step 3: Update `generate_optimized_schedule()` in `app.py`**

At the top of the function, after `colors = [...]`, add a DB fetch for incomplete assignments:

```python
    # Fetch incomplete assignments for each course
    conn = get_db_connection()
    course_assignments = {}
    for course in courses:
        rows = conn.execute(
            'SELECT * FROM assignments WHERE course_id = ? AND completed = 0',
            (course['id'],)
        ).fetchall()
        course_assignments[course['id']] = [dict(r) for r in rows]
    conn.close()
```

Then inside the daily priority loop, replace the single priority line:
```python
            priority = course['difficulty'] * (6 - course['confidence']) / days_until
```
with:
```python
            incomplete = course_assignments.get(course['id'], [])
            # Preserve existing floor: exam today counts as 0.5 days
            if days_until == 0:
                days_until = 0.5
            base_priority = course['difficulty'] * (6 - course['confidence']) / days_until

            if not incomplete:
                priority = base_priority * 0.75
            else:
                assignment_boost = 0.0
                for a in incomplete:
                    due_date = datetime.strptime(a['due_date'], '%Y-%m-%d').date()
                    days_until_due = (due_date - current_date).days
                    if days_until_due <= 14:
                        days_until_due = max(0.5, float(days_until_due))
                        assignment_boost += 1.0 / days_until_due
                priority = base_priority + assignment_boost
```

- [ ] **Step 4: Run all schedule tests**

```bash
source venv/bin/activate && pytest tests/test_schedule.py -v
```

Expected: all PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
source venv/bin/activate && pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app.py tests/test_schedule.py
git commit -m "feat: update schedule algorithm with assignment priority boost"
```

---

## Task 6: Update load-demo to Seed Assignments

**Files:**
- Modify: `app.py` — `load_demo()` route

- [ ] **Step 1: Write a failing test**

Add to `tests/test_assignments.py`:

```python
def test_load_demo_seeds_assignments(client):
    resp = client.post('/api/load-demo')
    assert resp.status_code == 200

    courses = client.get('/api/courses').get_json()
    assert len(courses) == 4

    total_assignments = 0
    for course in courses:
        assignments = client.get(f'/api/courses/{course["id"]}/assignments').get_json()
        total_assignments += len(assignments)

    assert total_assignments == 6
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
source venv/bin/activate && pytest tests/test_assignments.py::test_load_demo_seeds_assignments -v
```

Expected: FAIL — demo loads 0 assignments.

- [ ] **Step 3: Update `load_demo()` in `app.py`**

Replace the **entire body** of the `load_demo` function (everything after the docstring, before the final `return`) with the following. Courses must be inserted first so their auto-generated IDs can be captured; assignments are then inserted using those IDs.

```python
    conn = get_db_connection()
    conn.execute('DELETE FROM courses')  # ON DELETE CASCADE removes assignments too

    today = datetime.now()
    demo_courses = [
        {'name': 'Calculus Exam', 'exam_date': (today + timedelta(days=10)).strftime('%Y-%m-%d'), 'difficulty': 5, 'confidence': 2},
        {'name': 'Physics Final', 'exam_date': (today + timedelta(days=7)).strftime('%Y-%m-%d'), 'difficulty': 4, 'confidence': 3},
        {'name': 'History Essay', 'exam_date': (today + timedelta(days=14)).strftime('%Y-%m-%d'), 'difficulty': 2, 'confidence': 4},
        {'name': 'Programming Project', 'exam_date': (today + timedelta(days=5)).strftime('%Y-%m-%d'), 'difficulty': 5, 'confidence': 4},
    ]

    course_ids = {}
    for course in demo_courses:
        cursor = conn.execute(
            'INSERT INTO courses (name, exam_date, difficulty, confidence) VALUES (?, ?, ?, ?)',
            (course['name'], course['exam_date'], course['difficulty'], course['confidence'])
        )
        course_ids[course['name']] = cursor.lastrowid

    demo_assignments = [
        {'course': 'Calculus Exam',      'title': 'Problem Set 5',  'type': 'homework', 'days': 3},
        {'course': 'Calculus Exam',      'title': 'Chapter Quiz',   'type': 'quiz',     'days': 7},
        {'course': 'Physics Final',      'title': 'Lab Report',     'type': 'homework', 'days': 4},
        {'course': 'Physics Final',      'title': 'Midterm Review', 'type': 'homework', 'days': 6},
        {'course': 'History Essay',      'title': 'Outline Draft',  'type': 'homework', 'days': 2},
        {'course': 'Programming Project','title': 'Code Review',    'type': 'project',  'days': 3},
    ]

    for a in demo_assignments:
        due_date = (today + timedelta(days=a['days'])).strftime('%Y-%m-%d')
        conn.execute(
            'INSERT INTO assignments (course_id, title, due_date, type, completed) VALUES (?, ?, ?, ?, 0)',
            (course_ids[a['course']], a['title'], due_date, a['type'])
        )

    conn.commit()
    conn.close()
    return jsonify({'message': 'Demo data loaded successfully', 'count': len(demo_courses)}), 200
```

- [ ] **Step 4: Run the test**

```bash
source venv/bin/activate && pytest tests/test_assignments.py::test_load_demo_seeds_assignments -v
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
source venv/bin/activate && pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app.py
git commit -m "feat: seed demo assignments in load-demo endpoint"
```

---

## Task 7: Redesign planner.html with Tab Structure

**Files:**
- Modify: `templates/planner.html` — full replacement

- [ ] **Step 1: Replace `templates/planner.html` entirely**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Planner - StudySync</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div id="outdated-banner" class="outdated-banner" style="display:none;">
        <span>Your schedule may be outdated — regenerate?</span>
        <button id="banner-regenerate-btn" class="btn btn-sm btn-primary">Regenerate</button>
        <button id="banner-dismiss-btn" class="banner-dismiss">×</button>
    </div>

    <div class="planner-container">
        <header class="planner-header">
            <div class="header-content">
                <h1><a href="/" class="logo">StudySync</a></h1>
                <p class="subtitle">Your Smart Study Planner</p>
            </div>
        </header>

        <nav class="tab-bar">
            <button class="tab-btn active" data-tab="courses">Courses &amp; Assignments</button>
            <button class="tab-btn" data-tab="calendar">Calendar</button>
            <button class="tab-btn" data-tab="schedule">Schedule</button>
        </nav>

        <main class="planner-main">

            <!-- Tab 1: Courses & Assignments -->
            <div id="tab-courses" class="tab-panel planner-grid">
                <aside class="sidebar">
                    <section class="input-section">
                        <h2>Add Course</h2>
                        <form id="course-form" class="course-form">
                            <div class="form-group">
                                <label for="course-name">Course Name</label>
                                <input type="text" id="course-name" name="course-name" placeholder="e.g., Calculus" required>
                            </div>
                            <div class="form-group">
                                <label for="exam-date">Exam/Assignment Date</label>
                                <input type="date" id="exam-date" name="exam-date" required>
                            </div>
                            <div class="form-group">
                                <label for="difficulty">Difficulty Level: <span id="difficulty-value">3</span></label>
                                <div class="slider-labels"><span>Easy</span><span>Hard</span></div>
                                <input type="range" id="difficulty" name="difficulty" min="1" max="5" value="3" class="slider">
                            </div>
                            <div class="form-group">
                                <label for="confidence">Confidence Level: <span id="confidence-value">3</span></label>
                                <div class="slider-labels"><span>Low</span><span>High</span></div>
                                <input type="range" id="confidence" name="confidence" min="1" max="5" value="3" class="slider">
                            </div>
                            <button type="submit" class="btn btn-primary">Add Course</button>
                        </form>
                        <button id="load-demo-btn" class="btn btn-secondary">Load Demo Data</button>
                    </section>
                </aside>

                <div class="main-content">
                    <section class="courses-section">
                        <div class="section-header">
                            <h2>Your Courses</h2>
                            <span id="course-count" class="count-badge">0</span>
                        </div>
                        <div id="courses-list" class="courses-list">
                            <div class="empty-state">
                                <p>No courses added yet. Add your first course to get started!</p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- Tab 2: Calendar -->
            <div id="tab-calendar" class="tab-panel" hidden>
                <div class="calendar-container">
                    <div class="calendar-nav">
                        <button id="prev-month-btn" class="btn btn-secondary">&#8249;</button>
                        <h2 id="calendar-month-label"></h2>
                        <button id="next-month-btn" class="btn btn-secondary">&#8250;</button>
                    </div>
                    <div class="calendar-grid" id="calendar-grid">
                        <div class="calendar-day-header">Sun</div>
                        <div class="calendar-day-header">Mon</div>
                        <div class="calendar-day-header">Tue</div>
                        <div class="calendar-day-header">Wed</div>
                        <div class="calendar-day-header">Thu</div>
                        <div class="calendar-day-header">Fri</div>
                        <div class="calendar-day-header">Sat</div>
                    </div>
                </div>
            </div>

            <!-- Tab 3: Schedule -->
            <div id="tab-schedule" class="tab-panel" hidden>
                <div class="schedule-tab-content">
                    <section class="hours-section">
                        <h2>Study Time Available</h2>
                        <div class="form-group">
                            <label for="available-hours">Hours per day</label>
                            <input type="number" id="available-hours" name="available-hours" min="1" max="12" value="4" step="0.5">
                        </div>
                    </section>
                    <section class="generate-section">
                        <button id="generate-schedule-btn" class="btn btn-primary btn-large">Generate Schedule</button>
                        <div id="loading-spinner" class="loading-spinner" style="display: none;">
                            <div class="spinner"></div>
                            <p>Generating your optimized schedule...</p>
                        </div>
                    </section>
                    <section id="schedule-section" class="schedule-section" style="display: none;">
                        <h2>Your Optimized Study Schedule</h2>
                        <div id="schedule-summary" class="schedule-summary"></div>
                        <div id="schedule-timeline" class="schedule-timeline"></div>
                    </section>
                </div>
            </div>

        </main>
    </div>

    <script src="{{ url_for('static', filename='js/app.js') }}"></script>
</body>
</html>
```

- [ ] **Step 2: Verify page loads without JS errors**

Open http://localhost:5001 in browser. Navigate to `/planner`. Expected: page renders with header, three tab buttons, and the Courses & Assignments panel visible. No JS errors in browser console. Tabs 2 and 3 are hidden.

- [ ] **Step 3: Commit**

```bash
git add templates/planner.html
git commit -m "feat: redesign planner.html with three-tab structure"
```

---

## Task 8: Add CSS for Tabs, Assignments, and Calendar

**Files:**
- Modify: `static/css/style.css` — append new styles at the end

- [ ] **Step 1: Append the following CSS to `static/css/style.css`**

```css
/* ============================================
   Outdated Schedule Banner
   ============================================ */
.outdated-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: var(--navy);
    color: var(--white);
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.9rem;
}
.outdated-banner span { flex: 1; }
.banner-dismiss {
    background: none;
    border: none;
    color: var(--white);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
}
.btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }

/* ============================================
   Tab Bar
   ============================================ */
.tab-bar {
    display: flex;
    border-bottom: 2px solid var(--border-color);
    background: var(--white);
    padding: 0 2rem;
    gap: 0;
}
.tab-btn {
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
    padding: 1rem 1.5rem;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-light);
    cursor: pointer;
    transition: var(--transition);
    font-family: inherit;
}
.tab-btn:hover { color: var(--text-dark); }
.tab-btn.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
    font-weight: 600;
}

/* ============================================
   Tab Panels
   ============================================ */
.tab-panel { padding: 2rem; }
.tab-panel[hidden] { display: none; }

/* ============================================
   Schedule Tab Layout
   ============================================ */
.schedule-tab-content {
    max-width: 900px;
    margin: 0 auto;
}

/* ============================================
   Assignment List (inside course cards)
   ============================================ */
.expand-toggle {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
    color: var(--text-light);
    font-family: inherit;
    transition: var(--transition);
}
.expand-toggle:hover { background: var(--background); color: var(--text-dark); }

.assignments-panel {
    border-top: 1px solid var(--border-color);
    padding-top: 1rem;
    margin-top: 0.75rem;
}

.assignment-list { list-style: none; margin-bottom: 1rem; }

.assignment-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border-color);
    font-size: 0.85rem;
}
.assignment-item:last-child { border-bottom: none; }
.assignment-item input[type="checkbox"] { cursor: pointer; }
.assignment-item.completed .assignment-title { text-decoration: line-through; color: var(--text-light); }

.type-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
}
.type-badge.quiz     { background: #e8f4fd; color: #1a6fc4; }
.type-badge.homework { background: #fef3e8; color: #c46c1a; }
.type-badge.project  { background: #edf7ed; color: #2e7d32; }

.assignment-title { flex: 1; }
.assignment-due   { color: var(--text-light); font-size: 0.8rem; white-space: nowrap; }

.delete-assignment-btn {
    background: none;
    border: none;
    color: var(--danger-red);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    line-height: 1;
    opacity: 0.6;
}
.delete-assignment-btn:hover { opacity: 1; }

.add-assignment-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
}
.add-assignment-form input,
.add-assignment-form select {
    font-size: 0.85rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-family: inherit;
    background: var(--white);
    color: var(--text-dark);
}
.add-assignment-form input[type="text"]   { flex: 2; min-width: 120px; }
.add-assignment-form input[type="date"]   { flex: 1; min-width: 120px; }
.add-assignment-form select               { flex: 1; min-width: 100px; }
.add-assignment-form button               { white-space: nowrap; }

/* ============================================
   Calendar
   ============================================ */
.calendar-container { max-width: 1000px; margin: 0 auto; }

.calendar-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
}
.calendar-nav h2 { font-size: 1.3rem; font-weight: 600; }

.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    background: var(--border-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.calendar-day-header {
    background: var(--navy);
    color: var(--white);
    text-align: center;
    padding: 0.6rem 0;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.05em;
}

.calendar-cell {
    background: var(--white);
    min-height: 100px;
    padding: 0.4rem;
    vertical-align: top;
    position: relative;
}
.calendar-cell.empty { background: var(--background); }

.calendar-day-num {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-light);
    margin-bottom: 0.3rem;
}
.calendar-cell.today .calendar-day-num {
    background: var(--accent-blue);
    color: var(--white);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.chip {
    display: block;
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    margin-bottom: 0.2rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--white);
    font-weight: 500;
}
.chip.completed { text-decoration: line-through; opacity: 0.6; }

.more-chips-btn {
    display: block;
    font-size: 0.7rem;
    color: var(--accent-blue);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.1rem 0;
    font-family: inherit;
    font-weight: 600;
}
.more-chips-btn:hover { text-decoration: underline; }
```

- [ ] **Step 2: Verify CSS loads without errors**

Refresh http://localhost:5001/planner in the browser. Expected: tab bar renders with correct styling. No CSS errors in browser console.

- [ ] **Step 3: Commit**

```bash
git add static/css/style.css
git commit -m "feat: add CSS for tabs, assignments, calendar, and banner"
```

---

## Task 9: JS — Tab Switching, Color Fix, Assignment State

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Add `lastScheduleData` global variable and update color assignment**

At the top of `app.js`, after `const courseColors = [...]`, add:

```js
let lastScheduleData = null;
```

Replace the `assignCourseColor(index)` function:

```js
// Before (delete this):
function assignCourseColor(index) {
    return courseColors[index % courseColors.length];
}

// After (replace with):
function getCourseColor(course) {
    return courseColors[course.id % courseColors.length];
}
```

Update every call site of `assignCourseColor(index)` to use `getCourseColor(course)`. In `createCourseCard`, change:
```js
// Before:
const color = assignCourseColor(index);
// After:
const color = getCourseColor(course);
```

In `renderScheduleSummary`, change:
```js
// Before:
courses.forEach((course, index) => {
    courseColorMap[course.name] = assignCourseColor(index);
});
// After:
courses.forEach(course => {
    courseColorMap[course.name] = getCourseColor(course);
});
```

In `renderScheduleTimeline` → `createDayCard`, the block colors come from the schedule data directly (set in the algorithm), so no change needed there.

- [ ] **Step 2: Add tab switching**

Add to `app.js` (before or after the initialization section):

```js
// ============================================
// Tab Switching
// ============================================

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Restore tab from hash on load
    const hash = window.location.hash.slice(1);
    const validTabs = ['courses', 'calendar', 'schedule'];
    switchTab(validTabs.includes(hash) ? hash : 'courses', false);

    window.addEventListener('hashchange', () => {
        const tab = window.location.hash.slice(1);
        if (['courses', 'calendar', 'schedule'].includes(tab)) {
            switchTab(tab, false);
        }
    });
}

function switchTab(tabName, updateHash = true) {
    document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = true; });
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const panel = document.getElementById(`tab-${tabName}`);
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (panel) panel.hidden = false;
    if (btn) btn.classList.add('active');

    if (updateHash) window.location.hash = tabName;
    if (tabName === 'calendar') renderCalendar();
}
```

- [ ] **Step 3: Update `loadCourses()` to also fetch assignments per course**

Replace the existing `loadCourses()` function:

```js
async function loadCourses() {
    try {
        const response = await fetch('/api/courses');
        if (!response.ok) throw new Error('Failed to load courses');
        courses = await response.json();

        // Fetch assignments for each course and attach to course object
        await Promise.all(courses.map(async course => {
            const resp = await fetch(`/api/courses/${course.id}/assignments`);
            course.assignments = resp.ok ? await resp.json() : [];
        }));

        renderCourses();

        // Re-render calendar if it's visible
        const calPanel = document.getElementById('tab-calendar');
        if (calPanel && !calPanel.hidden) renderCalendar();

    } catch (error) {
        console.error('Error loading courses:', error);
        showNotification('Failed to load courses', 'error');
    }
}
```

- [ ] **Step 4: Call `initTabs()` inside `DOMContentLoaded`**

In the `DOMContentLoaded` handler, add `initTabs()` as the first call (before `loadCourses()`):

```js
document.addEventListener('DOMContentLoaded', function() {
    initTabs();   // <-- add this line first
    // ... rest of existing init code ...
```

- [ ] **Step 5: Store schedule data in `lastScheduleData` after generation**

In `handleGenerateSchedule()`, after `renderSchedule(scheduleData);`, add:
```js
lastScheduleData = scheduleData;
```

- [ ] **Step 6: Verify tabs work in browser**

Open http://localhost:5001/planner. Expected:
- Clicking each tab shows the correct panel and hides the others
- The URL hash updates (`#courses`, `#calendar`, `#schedule`)
- Refreshing the page on `#schedule` stays on the Schedule tab

- [ ] **Step 7: Commit**

```bash
git add static/js/app.js
git commit -m "feat: add tab switching, course.id-based colors, and assignment state loading"
```

---

## Task 10: JS — Assignment CRUD and Outdated-Schedule Banner

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Update `createCourseCard()` to add expand toggle and assignments panel**

Replace the `card.innerHTML = ...` block in `createCourseCard()` with:

```js
    card.innerHTML = `
        <div class="course-color-bar" style="background: ${color};"></div>
        <div class="course-card-header">
            <h3 class="course-name">${escapeHtml(course.name)}</h3>
            <div style="display:flex;gap:0.5rem;align-items:center;">
                <button class="expand-toggle" data-course-id="${course.id}">
                    Assignments (${course.assignments ? course.assignments.length : 0})
                </button>
                <button class="delete-btn" onclick="deleteCourse(${course.id})" aria-label="Delete course">×</button>
            </div>
        </div>
        <div class="course-details">
            <div class="course-detail-row">
                <span class="course-detail-label">Exam Date:</span>
                <span class="course-detail-value">${formattedDate}</span>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Days Until:</span>
                <span class="course-detail-value">${daysUntil} days</span>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Difficulty:</span>
                <div class="difficulty-indicator">${createIndicatorDots(course.difficulty)}</div>
            </div>
            <div class="course-detail-row">
                <span class="course-detail-label">Confidence:</span>
                <div class="confidence-indicator">${createIndicatorDots(course.confidence)}</div>
            </div>
        </div>
        <div class="assignments-panel" id="assignments-panel-${course.id}" style="display:none;">
            ${renderAssignmentList(course.assignments || [], course.id)}
        </div>
    `;

    // Expand/collapse toggle
    card.querySelector('.expand-toggle').addEventListener('click', function() {
        const panel = document.getElementById(`assignments-panel-${course.id}`);
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        this.textContent = `Assignments (${course.assignments ? course.assignments.length : 0})${isHidden ? ' ▲' : ''}`;
    });
```

- [ ] **Step 2: Add `renderAssignmentList()` function**

```js
function renderAssignmentList(assignments, courseId) {
    const listItems = assignments.map(a => `
        <li class="assignment-item ${a.completed ? 'completed' : ''}" id="assignment-item-${a.id}">
            <input type="checkbox" ${a.completed ? 'checked' : ''}
                onchange="toggleAssignment(${a.id}, this.checked, ${courseId})">
            <span class="type-badge ${a.type}">${a.type}</span>
            <span class="assignment-title">${escapeHtml(a.title)}</span>
            <span class="assignment-due">${formatDate(a.due_date)}</span>
            <button class="delete-assignment-btn" onclick="deleteAssignment(${a.id}, ${courseId})" aria-label="Delete assignment">×</button>
        </li>
    `).join('');

    return `
        <ul class="assignment-list">${listItems.length ? listItems : '<li style="color:var(--text-light);font-size:0.85rem;padding:0.4rem 0;">No assignments yet.</li>'}</ul>
        <form class="add-assignment-form" onsubmit="handleAddAssignment(event, ${courseId})">
            <input type="text" placeholder="Assignment title" required>
            <input type="date" required>
            <select required>
                <option value="">Type</option>
                <option value="quiz">Quiz</option>
                <option value="homework">Homework</option>
                <option value="project">Project</option>
            </select>
            <button type="submit" class="btn btn-primary btn-sm">Add</button>
        </form>
    `;
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 3: Add assignment CRUD functions**

```js
async function handleAddAssignment(event, courseId) {
    event.preventDefault();
    const form = event.target;
    const [titleInput, dateInput, typeSelect] = form.querySelectorAll('input, select');

    try {
        const resp = await fetch(`/api/courses/${courseId}/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: titleInput.value.trim(),
                due_date: dateInput.value,
                type: typeSelect.value
            })
        });
        if (!resp.ok) {
            const err = await resp.json();
            showNotification(err.error || 'Failed to add assignment', 'error');
            return;
        }
        form.reset();
        await loadCourses();
        showNotification('Assignment added!', 'success');
    } catch {
        showNotification('Failed to add assignment', 'error');
    }
}

async function deleteAssignment(assignmentId, courseId) {
    if (!confirm('Delete this assignment?')) return;
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
        if (!resp.ok) { showNotification('Failed to delete assignment', 'error'); return; }
        await loadCourses();
        showNotification('Assignment deleted', 'success');
    } catch {
        showNotification('Failed to delete assignment', 'error');
    }
}

async function toggleAssignment(assignmentId, completed, courseId) {
    try {
        const resp = await fetch(`/api/assignments/${assignmentId}/complete`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: completed ? 1 : 0 })
        });
        if (!resp.ok) { showNotification('Failed to update assignment', 'error'); return; }

        // Update local state
        const course = courses.find(c => c.id === courseId);
        if (course && course.assignments) {
            const a = course.assignments.find(a => a.id === assignmentId);
            if (a) a.completed = completed ? 1 : 0;
        }

        // Update item style without full reload
        const item = document.getElementById(`assignment-item-${assignmentId}`);
        if (item) item.classList.toggle('completed', completed);

        // Show outdated banner if schedule exists
        if (lastScheduleData) showOutdatedBanner();

    } catch {
        showNotification('Failed to update assignment', 'error');
    }
}
```

- [ ] **Step 4: Add outdated-schedule banner logic**

```js
// ============================================
// Outdated Schedule Banner
// ============================================

function showOutdatedBanner() {
    document.getElementById('outdated-banner').style.display = 'flex';
}

function initBanner() {
    document.getElementById('banner-dismiss-btn').addEventListener('click', () => {
        document.getElementById('outdated-banner').style.display = 'none';
    });
    document.getElementById('banner-regenerate-btn').addEventListener('click', () => {
        document.getElementById('outdated-banner').style.display = 'none';
        switchTab('schedule');
        handleGenerateSchedule();
    });
}
```

Call `initBanner()` inside the `DOMContentLoaded` handler.

- [ ] **Step 5: Verify assignment CRUD in browser**

Open http://localhost:5001/planner. Load demo data. Click "Assignments (2)" on a course card. Expected:
- Panel expands showing 2 assignments with type badges and dates
- Adding an assignment via the form refreshes the list
- Checking/unchecking a checkbox updates the style and shows the outdated banner (after generating a schedule)
- Deleting an assignment prompts confirmation and removes it

- [ ] **Step 6: Commit**

```bash
git add static/js/app.js
git commit -m "feat: add assignment CRUD UI and outdated-schedule banner"
```

---

## Task 11: JS — Calendar Rendering

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Add calendar state variables**

At the top of `app.js`, after `let lastScheduleData = null;`, add:

```js
let calendarMonth = new Date().getMonth();
let calendarYear  = new Date().getFullYear();
let expandedCalendarCell = null;
```

- [ ] **Step 2: Add calendar rendering functions**

```js
// ============================================
// Calendar
// ============================================

function initCalendar() {
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderCalendar();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderCalendar();
    });
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('calendar-month-label');
    if (!grid || !label) return;

    // Remove all non-header cells
    Array.from(grid.children).forEach(child => {
        if (!child.classList.contains('calendar-day-header')) child.remove();
    });

    expandedCalendarCell = null;

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    label.textContent = new Date(calendarYear, calendarMonth, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Padding cells
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-cell empty';
        grid.appendChild(empty);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = 'calendar-cell' + (dateStr === todayStr ? ' today' : '');

        const dayNum = document.createElement('span');
        dayNum.className = 'calendar-day-num';
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        const chips = collectChipsForDate(dateStr);
        renderCellChips(cell, chips);

        grid.appendChild(cell);
    }
}

function collectChipsForDate(dateStr) {
    const chips = [];

    // Due date chips from courses
    courses.forEach(course => {
        (course.assignments || []).forEach(a => {
            if (a.due_date === dateStr) {
                chips.push({
                    label: `${capitalize(a.type)}: ${course.name}`,
                    color: getCourseColor(course),
                    completed: !!a.completed,
                    isSchedule: false
                });
            }
        });
    });

    // Study schedule chips
    if (lastScheduleData) {
        const dayData = lastScheduleData.schedule.find(d => d.date === dateStr);
        if (dayData) {
            dayData.blocks.forEach(block => {
                chips.push({
                    label: `${block.course} ${block.hours}h`,
                    color: block.color,
                    completed: false,
                    isSchedule: true
                });
            });
        }
    }

    return chips;
}

function renderCellChips(cell, chips) {
    const MAX_VISIBLE = 3;

    const visible = chips.slice(0, MAX_VISIBLE);
    const hidden  = chips.slice(MAX_VISIBLE);

    visible.forEach(chip => cell.appendChild(makeChipEl(chip)));

    if (hidden.length > 0) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'more-chips-btn';
        moreBtn.textContent = `+${hidden.length} more`;
        moreBtn.addEventListener('click', () => {
            // Collapse any previously expanded cell
            if (expandedCalendarCell && expandedCalendarCell !== cell) {
                const prevBtn = expandedCalendarCell.querySelector('.more-chips-btn');
                if (prevBtn) {
                    // Remove expanded chips
                    Array.from(expandedCalendarCell.querySelectorAll('.chip.extra')).forEach(c => c.remove());
                    const prevCount = parseInt(prevBtn.dataset.hiddenCount);
                    prevBtn.textContent = `+${prevCount} more`;
                }
            }

            if (expandedCalendarCell === cell) {
                // Collapse this cell
                Array.from(cell.querySelectorAll('.chip.extra')).forEach(c => c.remove());
                moreBtn.textContent = `+${hidden.length} more`;
                expandedCalendarCell = null;
            } else {
                // Expand this cell
                hidden.forEach(chip => {
                    const el = makeChipEl(chip);
                    el.classList.add('extra');
                    cell.insertBefore(el, moreBtn);
                });
                moreBtn.textContent = `show less`;
                moreBtn.dataset.hiddenCount = hidden.length;
                expandedCalendarCell = cell;
            }
        });
        moreBtn.dataset.hiddenCount = hidden.length;
        cell.appendChild(moreBtn);
    }
}

function makeChipEl(chip) {
    const el = document.createElement('span');
    el.className = 'chip' + (chip.completed ? ' completed' : '');
    el.style.background = chip.color;
    el.textContent = chip.label;
    el.title = chip.label;
    return el;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
```

- [ ] **Step 3: Call `initCalendar()` inside `DOMContentLoaded`**

Add `initCalendar();` in the `DOMContentLoaded` handler alongside the other init calls.

- [ ] **Step 4: Refresh calendar after schedule generation**

In `handleGenerateSchedule()`, after `lastScheduleData = scheduleData;`, add:
```js
const calPanel = document.getElementById('tab-calendar');
if (calPanel && !calPanel.hidden) renderCalendar();
```

- [ ] **Step 5: Verify calendar in browser**

Open http://localhost:5001/planner. Load demo data. Click the Calendar tab. Expected:
- Current month grid renders with correct day layout
- Assignment due dates appear as colored chips on their respective days
- Previous/next month navigation works
- Generate a schedule on the Schedule tab, then return to Calendar — study blocks appear as chips
- Day cells with >3 chips show "+N more"; clicking expands them
- Today's date is highlighted

- [ ] **Step 6: Run full test suite one final time**

```bash
source venv/bin/activate && pytest tests/ -v
```

Expected: all PASS.

- [ ] **Step 7: Final commit**

```bash
git add static/js/app.js
git commit -m "feat: add calendar rendering with due date and schedule chips"
```

---

## Done

All backend changes are covered by pytest tests. Manual browser verification covers the frontend. The full test suite should remain green throughout. Restart the Flask server after backend changes with `python app.py`.
