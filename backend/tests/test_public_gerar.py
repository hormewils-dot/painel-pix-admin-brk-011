# Tests for public PIX generation (POST /api/public/gerar) and admin integration
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not set in environment")

ADMIN_USER = "donas"
ADMIN_PASS = "Seinao10@@"

TEST_DOC = "16768983601"  # CPF 167.689.836-01
TEST_CITY = "São José de Ribamar - MA"
TEST_VALUE = 145.00


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip("Login failed; cannot obtain token")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_chave(token):
    r = requests.get(f"{BASE_URL}/api/settings",
                     headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    return (r.json().get("chave_pix") or "").strip()


# ----------------------- POST /api/public/gerar ----------------------------

def test_gerar_returns_pix_with_admin_key(admin_chave):
    if not admin_chave:
        pytest.skip("No chave_pix configured in admin settings")
    r = requests.post(f"{BASE_URL}/api/public/gerar", json={
        "documento": TEST_DOC,
        "cidade": TEST_CITY,
        "valor": TEST_VALUE,
        "meses": ["12/2026", "10/2026", "11/2026"],
        "session_id": "TEST_sess_pytest",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "pix_code" in data and isinstance(data["pix_code"], str) and len(data["pix_code"]) > 0
    # pix_code must embed the admin PIX key
    assert admin_chave in data["pix_code"], "Admin PIX key not found in generated pix_code"
    fat = data["fatura"]
    assert fat["documento"] == TEST_DOC
    assert fat["valor"] == TEST_VALUE
    assert fat["cidade"] == TEST_CITY
    assert fat["origem"] == "site_publico"
    assert "_id" not in fat, "Mongo _id leaked in response"
    assert "id" in fat and isinstance(fat["id"], str)


def test_gerar_invalid_document():
    r = requests.post(f"{BASE_URL}/api/public/gerar", json={
        "documento": "123",
        "cidade": TEST_CITY,
        "valor": TEST_VALUE,
    })
    assert r.status_code == 400, r.text


def test_gerar_invalid_value():
    r = requests.post(f"{BASE_URL}/api/public/gerar", json={
        "documento": TEST_DOC,
        "cidade": TEST_CITY,
        "valor": 0,
    })
    assert r.status_code == 400, r.text


# --------------------- Admin integration: GET /api/faturas -----------------

def test_generated_fatura_appears_in_admin(admin_chave, token):
    if not admin_chave:
        pytest.skip("No chave_pix configured in admin settings")
    # Generate a uniquely identifiable fatura
    unique_sess = "TEST_sess_admin_check"
    gen = requests.post(f"{BASE_URL}/api/public/gerar", json={
        "documento": TEST_DOC,
        "cidade": TEST_CITY,
        "valor": TEST_VALUE,
        "session_id": unique_sess,
    })
    assert gen.status_code == 200, gen.text
    fat_id = gen.json()["fatura"]["id"]

    # Fetch authenticated faturas list
    r = requests.get(f"{BASE_URL}/api/faturas",
                     headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    faturas = r.json()["faturas"]
    match = [f for f in faturas if f.get("id") == fat_id]
    assert match, "Generated fatura not found in admin /api/faturas"
    f = match[0]
    assert f["documento"] == TEST_DOC
    assert f["valor"] == TEST_VALUE
    assert f["cidade"] == TEST_CITY
    assert f["origem"] == "site_publico"


def test_faturas_requires_auth():
    r = requests.get(f"{BASE_URL}/api/faturas")
    assert r.status_code in (401, 403), r.text
