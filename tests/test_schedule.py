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
    id1 = _setup_course(client, name='CourseA', difficulty=4, confidence=2, exam_days=10)
    id2 = _setup_course(client, name='CourseB', difficulty=4, confidence=2, exam_days=10)

    resp = client.post(f'/api/courses/{id1}/assignments', json={
        'title': 'Done', 'due_date': _today_plus(5), 'type': 'quiz'
    })
    assignment_id = resp.get_json()['id']
    client.patch(f'/api/assignments/{assignment_id}/complete', json={'completed': 1})

    client.post(f'/api/courses/{id2}/assignments', json={
        'title': 'Pending', 'due_date': _today_plus(7), 'type': 'homework'
    })

    resp = client.post('/api/generate-schedule', json={'available_hours': 4})
    data = resp.get_json()
    summary = data['summary']['hours_per_subject']

    assert summary.get('CourseB', 0) >= summary.get('CourseA', 0)


def test_assignment_boost_increases_hours_for_urgent_course(client):
    """Course with assignment due within 14 days gets more hours than equivalent course without."""
    id_boosted = _setup_course(client, name='Urgent', difficulty=3, confidence=3, exam_days=20)
    id_plain = _setup_course(client, name='Plain', difficulty=3, confidence=3, exam_days=20)

    client.post(f'/api/courses/{id_boosted}/assignments', json={
        'title': 'Quiz tomorrow', 'due_date': _today_plus(3), 'type': 'quiz'
    })
    client.post(f'/api/courses/{id_plain}/assignments', json={
        'title': 'Far away', 'due_date': _today_plus(30), 'type': 'homework'
    })

    resp = client.post('/api/generate-schedule', json={'available_hours': 4})
    data = resp.get_json()
    summary = data['summary']['hours_per_subject']

    assert summary.get('Urgent', 0) >= summary.get('Plain', 0)
