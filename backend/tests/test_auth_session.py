import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env read is not available here; fail fast.
    raise RuntimeError("REACT_APP_BACKEND_URL not set in environment")

ADMIN_USER = "donas"
ADMIN_PASS = "Seinao10@@"


# ----------------------------- Auth login ---------------------------------

def test_login_success():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 0
    assert "user" in data
    assert data["user"]["username"] == ADMIN_USER
    assert data["user"]["role"] == "admin"


def test_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": "wrong_pass_123"})
    assert r.status_code == 401, r.text


def test_login_unknown_user():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "TEST_nouser", "password": "x"})
    assert r.status_code == 401, r.text


# ------------------------------ /auth/me ----------------------------------

@pytest.fixture
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip("Login failed; cannot obtain token")
    return r.json()["token"]


def test_me_valid_token(token):
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["username"] == ADMIN_USER
    assert data["role"] == "admin"


def test_me_invalid_token():
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": "Bearer invalid.token.here"})
    assert r.status_code == 401, r.text


def test_me_no_token():
    r = requests.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code in (401, 403), r.text


# ------------------------------ CORS ---------------------------------------

def test_cors_no_credentials_with_wildcard():
    """With CORS_ORIGINS='*', allow_credentials must be False (valid combo)."""
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Origin": "https://example.com",
                              "Authorization": "Bearer invalid"})
    acao = r.headers.get("access-control-allow-origin")
    acac = r.headers.get("access-control-allow-credentials")
    # Invalid combo would be '*' + 'true'. Ensure that does NOT happen.
    if acao == "*":
        assert acac != "true", f"Invalid CORS combo: ACAO=* with ACAC=true"


# --------------------------- Public info -----------------------------------

def test_public_info():
    r = requests.get(f"{BASE_URL}/api/public/info")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "cidades" in data
    assert isinstance(data["cidades"], list)
