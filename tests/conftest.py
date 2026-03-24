import pytest
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
