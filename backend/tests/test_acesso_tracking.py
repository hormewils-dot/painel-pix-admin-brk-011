import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = os.environ.get("ADMIN_USERNAME", "donas")
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "Seinao10@@")

IPHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
             "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
WIN_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------- Login -------------------------
def test_login_returns_token_and_user():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d.get("token"), str) and len(d["token"]) > 0
    assert d["user"]["username"] == ADMIN_USER


def test_login_invalid():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": "wrong"})
    assert r.status_code == 401


# ------------------- POST /public/acesso (mobile/iOS) -------------------
def test_acesso_home_mobile_ios(auth):
    before = requests.get(f"{API}/dashboard/clicks", params={"page": "home"}, headers=auth).json()["total"]
    r = requests.post(
        f"{API}/public/acesso",
        json={"page": "home", "cidade": "TEST_Cidade"},
        headers={"User-Agent": IPHONE_UA, "X-Forwarded-For": "8.8.8.8"},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    data = requests.get(f"{API}/dashboard/clicks", params={"page": "home"}, headers=auth).json()
    assert data["total"] == before + 1, "home click counter did not increment"
    row = data["clicks"][0]
    assert row["device"] == "mobile", f"expected mobile, got {row['device']}"
    assert row["so"] == "iOS", f"expected iOS, got {row['so']}"
    assert "location" in row
    # ip-api external lookup for 8.8.8.8 should yield a location (may be empty if network blocked)
    assert isinstance(row["location"], str)
    assert "created_at" in row and row["created_at"]
    return row["location"]


# ------------------- POST /public/acesso (desktop/Windows) -------------------
def test_acesso_home_desktop_windows(auth):
    r = requests.post(
        f"{API}/public/acesso",
        json={"page": "home", "cidade": "TEST_Win"},
        headers={"User-Agent": WIN_UA, "X-Forwarded-For": "8.8.4.4"},
    )
    assert r.status_code == 200, r.text
    data = requests.get(f"{API}/dashboard/clicks", params={"page": "home"}, headers=auth).json()
    row = data["clicks"][0]
    assert row["device"] == "desktop", f"expected desktop, got {row['device']}"
    assert row["so"] == "Windows", f"expected Windows, got {row['so']}"


# ------------------- GET /activities acesso_home -------------------
def test_activity_acesso_home_created(auth):
    requests.post(
        f"{API}/public/acesso",
        json={"page": "home", "cidade": "TEST_Act"},
        headers={"User-Agent": IPHONE_UA, "X-Forwarded-For": "8.8.8.8"},
    )
    acts = requests.get(f"{API}/activities", headers=auth).json()["activities"]
    home_acts = [a for a in acts if a.get("type") == "acesso_home"]
    assert home_acts, "no acesso_home activity found"
    a = home_acts[0]
    assert a["title"].startswith("Novo acesso")
    assert "subtitle" in a  # subtitle = localização ou cidade
    assert "so" in a and "location" in a and "device" in a


# ------------------- Regression: acesso_faturas via /public/lead -------------------
def test_lead_creates_acesso_faturas_activity(auth):
    documento = "12345678901"
    r = requests.post(
        f"{API}/public/lead",
        json={"documento": documento, "cidade": "TEST_Lead"},
        headers={"User-Agent": WIN_UA},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    acts = requests.get(f"{API}/activities", headers=auth).json()["activities"]
    fat_acts = [a for a in acts if a.get("type") == "acesso_faturas" and documento in a.get("title", "")]
    assert fat_acts, "acesso_faturas activity not created"
    assert fat_acts[0]["title"] == f"Débitos Visualizado - Usuário {documento}"


# ------------------- Regression: faturas list loads -------------------
def test_faturas_list_loads(auth):
    r = requests.get(f"{API}/faturas", headers=auth)
    assert r.status_code == 200
    d = r.json()
    assert "faturas" in d and isinstance(d["faturas"], list)
    assert "total" in d


# ------------------- Auth required on protected endpoints -------------------
def test_clicks_requires_auth():
    r = requests.get(f"{API}/dashboard/clicks", params={"page": "home"})
    assert r.status_code in (401, 403)
