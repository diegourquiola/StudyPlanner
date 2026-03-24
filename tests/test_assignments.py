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
