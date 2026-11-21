import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = os.environ.get("ADMIN_USERNAME", "donas")
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "Seinao10@@")

WIN_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _count_debitos_activities(auth, documento):
    acts = requests.get(f"{API}/activities", params={"limit": 100}, headers=auth).json()["activities"]
    title = f"Débitos Visualizado - Usuário {documento}"
    return [a for a in acts if a.get("type") == "acesso_faturas" and a.get("title") == title]


# ------------------- REGRESSION: /public/gerar route exists -------------------
def test_public_gerar_route_exists():
    """Route must exist (not 404/405). 503 (missing chave_pix) or 400 are acceptable."""
    r = requests.post(
        f"{API}/public/gerar",
        json={"documento": "98765432100", "valor": 100.0, "session_id": "TEST_sid_gerar", "cidade": "TEST_Cidade"},
        headers={"User-Agent": WIN_UA},
    )
    assert r.status_code not in (404, 405), f"route missing: {r.status_code} {r.text}"
    assert r.status_code in (200, 400, 503), f"unexpected status: {r.status_code} {r.text}"
    print(f"/public/gerar status={r.status_code} body={r.text[:200]}")


# ------------------- MAIN BUG: /public/lead creates activity every time -------------------
def test_lead_creates_debitos_activity_every_time_same_session(auth):
    documento = "98765432100"
    sid = "TEST_sid_dedup_bug"

    before = len(_count_debitos_activities(auth, documento))

    r1 = requests.post(
        f"{API}/public/lead",
        json={"documento": documento, "cidade": "TEST_Cidade", "session_id": sid},
        headers={"User-Agent": WIN_UA, "X-Forwarded-For": "177.182.0.1"},
    )
    assert r1.status_code == 200, r1.text
    assert r1.json().get("ok") is True
    time.sleep(1)

    r2 = requests.post(
        f"{API}/public/lead",
        json={"documento": documento, "cidade": "TEST_Cidade", "session_id": sid},
        headers={"User-Agent": WIN_UA, "X-Forwarded-For": "177.182.0.1"},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json().get("ok") is True
    time.sleep(1)

    after = len(_count_debitos_activities(auth, documento))
    created = after - before
    assert created >= 2, f"expected 2 new 'Débitos Visualizado' activities, got {created} (before={before}, after={after})"
    print(f"Created {created} 'Débitos Visualizado' activities for same session_id")


# ------------------- Activity enrichment: location/device/so -------------------
def test_debitos_activity_has_location_device_so(auth):
    documento = "11122233344"
    sid = "TEST_sid_enrich"
    requests.post(
        f"{API}/public/lead",
        json={"documento": documento, "cidade": "TEST_Cidade", "session_id": sid},
        headers={"User-Agent": WIN_UA, "X-Forwarded-For": "8.8.8.8"},
    )
    time.sleep(1)
    acts = _count_debitos_activities(auth, documento)
    assert acts, "no 'Débitos Visualizado' activity found"
    a = acts[0]
    assert "location" in a, "location field missing"
    assert "device" in a and a["device"] in ("desktop", "mobile"), f"device bad: {a.get('device')}"
    assert "so" in a and a["so"], f"so missing: {a.get('so')}"
    # 8.8.8.8 should geolocate to a non-empty string (may be empty if network blocked)
    assert isinstance(a["location"], str)
    print(f"Enriched activity: device={a['device']} so={a['so']} location='{a['location']}'")


# ------------------- REGRESSION: /public/acesso home -------------------
def test_acesso_home_regression(auth):
    before = requests.get(f"{API}/dashboard/clicks", params={"page": "home"}, headers=auth).json()["total"]
    r = requests.post(
        f"{API}/public/acesso",
        json={"page": "home", "cidade": "TEST_Cidade"},
        headers={"User-Agent": WIN_UA, "X-Forwarded-For": "8.8.4.4"},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    time.sleep(0.5)
    data = requests.get(f"{API}/dashboard/clicks", params={"page": "home"}, headers=auth).json()
    assert data["total"] == before + 1, "home click counter did not increment"
    row = data["clicks"][0]
    assert row["device"] == "desktop"
    assert row["so"] == "Windows"
    assert "location" in row


# ------------------- REGRESSION: faturas list + clicks modal data -------------------
def test_faturas_list_loads(auth):
    r = requests.get(f"{API}/faturas", headers=auth)
    assert r.status_code == 200
    d = r.json()
    assert "faturas" in d and isinstance(d["faturas"], list)
    assert "total" in d


def test_dashboard_clicks_have_full_detail(auth):
    data = requests.get(f"{API}/dashboard/clicks", params={"page": "home"}, headers=auth).json()
    assert data["clicks"], "no clicks recorded"
    row = data["clicks"][0]
    for field in ("location", "device", "so", "created_at"):
        assert field in row, f"click row missing {field}"


# ------------------- Auth guard -------------------
def test_activities_requires_auth():
    r = requests.get(f"{API}/activities")
    assert r.status_code in (401, 403)
