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
        conn.commit()
    conn.close()


def test_get_assignments_empty(client):
    """GET assignments for a course with no assignments returns empty list."""
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
