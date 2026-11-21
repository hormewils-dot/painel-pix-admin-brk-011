"""Backend tests for the BRK painel bug-fix verification.

Covers: admin login, auth/me (session revalidation on refresh),
public access ping recording an 'acesso_home' activity, and the
activities endpoint count increasing.
"""
import os
import requests
import pytest

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'donas')
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"]
    assert data["user"]["username"] == ADMIN_USERNAME
    return data["token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Auth ----------------

class TestAuth:
    def test_login_success(self, token):
        assert token

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"username": ADMIN_USERNAME, "password": "wrong_pw_xyz"})
        assert r.status_code == 401

    def test_auth_me_valid(self, auth_headers):
        # Simulates the refresh revalidation call (/auth/me) that keeps session.
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == ADMIN_USERNAME
        assert data["role"] == "admin"

    def test_auth_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_auth_me_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": "Bearer not.a.valid.token"})
        assert r.status_code == 401


# ---------------- Public access ping / real-time activity ----------------

class TestPublicAcessoActivity:
    def test_acesso_increases_activity_count(self, auth_headers):
        before = requests.get(f"{BASE_URL}/api/activities?limit=100", headers=auth_headers)
        assert before.status_code == 200
        count_before = len(before.json()["activities"])

        ping = requests.post(f"{BASE_URL}/api/public/acesso", json={"page": "home"})
        assert ping.status_code == 200
        assert ping.json().get("ok") is True

        after = requests.get(f"{BASE_URL}/api/activities?limit=100", headers=auth_headers)
        assert after.status_code == 200
        acts = after.json()["activities"]
        # count should increase (unless already capped at 100)
        assert len(acts) >= count_before

        # newest activity should be an acesso_home with 'Novo acesso' title
        home_acts = [a for a in acts if a.get("type") == "acesso_home"]
        assert home_acts, "no acesso_home activity found"
        assert any("Novo acesso" in (a.get("title") or "") for a in home_acts)

    def test_activities_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/activities")
        assert r.status_code == 401


# ---------------- Public info ----------------

class TestPublicInfo:
    def test_public_info_shape(self):
        r = requests.get(f"{BASE_URL}/api/public/info")
        assert r.status_code == 200
        data = r.json()
        for key in ("beneficiario", "pagamento_disponivel", "valor_padrao", "cidades"):
            assert key in data
        assert isinstance(data["cidades"], list)
