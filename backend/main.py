import base64
import json
import os
import re
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

DEFAULT_STORE = "Magnum Cash & Carry (Астана, пр. Туран)"

app = FastAPI(title="EcoFridge AI", description="Zero-waste холодильник для семей Астаны")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

def compute_status(days_left: int) -> str:
    if days_left <= 1:
        return "urgent"
    if days_left <= 3:
        return "warning"
    return "fresh"


def make_item(item_id, name, category, price_tenge, weight_kg, days_left) -> dict:
    return {
        "id": str(item_id),
        "name": name,
        "category": category,
        "price_tenge": int(price_tenge),
        "weight_kg": float(weight_kg),
        "days_left": int(days_left),
        "status": compute_status(days_left),
    }


def seed_state() -> dict:
    return {
        "stats": {
            "saved_tenge": 14850,
            "at_risk_tenge": 4120,
            "co2_saved_kg": 6.4,
            "items_saved_count": 18,
        },
        "items": [
            make_item(1, "Молоко «Родина» 2.5%, 1л", "Молочные продукты", 680, 1.0, 1),
            make_item(2, "Фарш говяжий охлажденный", "Мясо и птица", 2850, 0.5, 1),
            make_item(3, "Шпинат свежий", "Овощи и фрукты", 590, 0.2, 2),
            make_item(4, "Сметана President 20%", "Молочные продукты", 890, 0.4, 3),
            make_item(5, "Творог «Мое» 5%", "Молочные продукты", 740, 0.35, 2),
            make_item(6, "Яблоки Айдаред", "Овощи и фрукты", 950, 1.5, 8),
        ],
    }


STATE = seed_state()
NEXT_ID = 7


def next_id() -> int:
    global NEXT_ID
    value = NEXT_ID
    NEXT_ID += 1
    return value


def get_state() -> dict:
    STATE["stats"]["at_risk_tenge"] = sum(
        item["price_tenge"] for item in STATE["items"] if item["status"] in ("urgent", "warning")
    )
    return STATE


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ItemIn(BaseModel):
    name: str
    category: str
    price_tenge: int
    weight_kg: float
    days_left: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/state")
def api_get_state():
    return get_state()


@app.post("/api/items")
def api_add_item(item: ItemIn):
    new_item = make_item(
        next_id(), item.name, item.category, item.price_tenge, item.weight_kg, item.days_left
    )
    STATE["items"].append(new_item)
    return get_state()


@app.post("/api/consume/{item_id}")
def api_consume(item_id: str):
    index = next((i for i, it in enumerate(STATE["items"]) if it["id"] == item_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Продукт не найден в холодильнике")

    item = STATE["items"].pop(index)
    STATE["stats"]["saved_tenge"] += item["price_tenge"]
    STATE["stats"]["co2_saved_kg"] = round(
        STATE["stats"]["co2_saved_kg"] + round(item["weight_kg"] * 2.5, 2), 2
    )
    STATE["stats"]["items_saved_count"] += 1
    return get_state()


@app.post("/api/scan-receipt")
async def api_scan_receipt(request: Request):
    content_type = request.headers.get("content-type", "")
    store_name: Optional[str] = None
    file_bytes: Optional[bytes] = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            file_bytes = await upload.read()
        store_name = form.get("store")
    else:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        store_name = payload.get("store")

    products = None
    if file_bytes and (GEMINI_API_KEY or OPENAI_API_KEY):
        try:
            products = await recognize_receipt_with_ai(file_bytes)
        except Exception:
            products = None

    if not products:
        products = fallback_receipt_items()

    added_items = []
    for product in products:
        new_item = make_item(
            next_id(),
            product["name"],
            product["category"],
            product["price_tenge"],
            product["weight_kg"],
            product["days_left"],
        )
        STATE["items"].append(new_item)
        added_items.append(new_item)

    total_receipt_tenge = sum(it["price_tenge"] for it in added_items)

    return {
        "scanned_store": store_name or DEFAULT_STORE,
        "added_items": added_items,
        "total_receipt_tenge": total_receipt_tenge,
        "state": get_state(),
    }


@app.post("/api/generate-recipe")
async def api_generate_recipe():
    risky_items = [it for it in STATE["items"] if it["status"] in ("urgent", "warning")]
    if not risky_items:
        risky_items = STATE["items"][:3]

    recipe = None
    if GEMINI_API_KEY or OPENAI_API_KEY:
        try:
            recipe = await generate_recipe_with_ai(risky_items)
        except Exception:
            recipe = None

    if not recipe:
        recipe = generate_recipe_fallback(risky_items)

    return recipe


# ---------------------------------------------------------------------------
# Receipt recognition (AI + fallback)
# ---------------------------------------------------------------------------

def fallback_receipt_items() -> list:
    return [
        {"name": "Куриное филе «Алель»", "category": "Мясо и птица", "price_tenge": 2190, "weight_kg": 0.9, "days_left": 2},
        {"name": "Кефир «Фудмастер»", "category": "Молочные продукты", "price_tenge": 620, "weight_kg": 0.5, "days_left": 3},
        {"name": "Томаты черри", "category": "Овощи и фрукты", "price_tenge": 1150, "weight_kg": 0.4, "days_left": 4},
        {"name": "Сыр Гауда", "category": "Молочные продукты", "price_tenge": 1890, "weight_kg": 0.3, "days_left": 10},
    ]


def parse_products_json(text: str) -> list:
    match = re.search(r"\[.*\]", text, re.DOTALL)
    raw = match.group(0) if match else text
    products = json.loads(raw)
    cleaned = []
    for p in products:
        cleaned.append(
            {
                "name": str(p.get("name", "Продукт")),
                "category": str(p.get("category", "Другое")),
                "price_tenge": int(p.get("price_tenge", 0) or 0),
                "weight_kg": float(p.get("weight_kg", 0.3) or 0.3),
                "days_left": int(p.get("days_left", 3) or 3),
            }
        )
    if not cleaned:
        raise ValueError("empty recognition result")
    return cleaned


RECEIPT_PROMPT = (
    "Ты распознаёшь чек или фото продуктов из супермаркета в Казахстане. "
    "Верни ТОЛЬКО JSON-массив объектов с полями name, category, price_tenge (int, тенге), "
    "weight_kg (float), days_left (int, нормативный срок хранения продукта в холодильнике в днях). "
    "Никакого текста кроме JSON-массива."
)


async def recognize_receipt_with_ai(file_bytes: bytes) -> list:
    b64 = base64.b64encode(file_bytes).decode()

    if OPENAI_API_KEY:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": RECEIPT_PROMPT},
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                            ],
                        }
                    ],
                    "max_tokens": 800,
                },
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]
            return parse_products_json(text)

    if GEMINI_API_KEY:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
                f"?key={GEMINI_API_KEY}",
                json={
                    "contents": [
                        {
                            "parts": [
                                {"text": RECEIPT_PROMPT},
                                {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                            ]
                        }
                    ]
                },
            )
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            return parse_products_json(text)

    raise RuntimeError("no AI key configured")


# ---------------------------------------------------------------------------
# Recipe generation (AI + fallback)
# ---------------------------------------------------------------------------

async def generate_recipe_with_ai(items: list) -> Optional[dict]:
    ingredient_lines = "\n".join(
        f"- {it['name']} ({it['category']}, {it['price_tenge']} ₸, осталось {it['days_left']} дн., {it['weight_kg']} кг)"
        for it in items
    )
    prompt = (
        "Ты шеф-повар эко-приложения EcoFridge AI в Казахстане. "
        "У семьи в холодильнике скоро испортятся эти продукты:\n"
        f"{ingredient_lines}\n\n"
        "Придумай один простой Zero-Waste рецепт на основе именно этих продуктов. "
        "Ответь ТОЛЬКО JSON без текста вокруг, строго в формате: "
        '{"title": str, "cooking_time_min": int, "used_ingredients": [str], '
        '"steps": [str, str, str, str], "eco_tip": str}'
    )

    text = None
    if OPENAI_API_KEY:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 600,
                },
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]
    elif GEMINI_API_KEY:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
                f"?key={GEMINI_API_KEY}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    if not text:
        return None

    match = re.search(r"\{.*\}", text, re.DOTALL)
    raw = match.group(0) if match else text
    data = json.loads(raw)
    steps = data.get("steps") or []
    if not steps:
        raise ValueError("no steps returned")

    money_saved = sum(it["price_tenge"] for it in items)
    co2_prevented = round(sum(it["weight_kg"] for it in items) * 2.5, 2)

    return {
        "title": str(data.get("title") or "Блюдо Zero Waste"),
        "cooking_time_min": int(data.get("cooking_time_min") or 20),
        "used_ingredients": data.get("used_ingredients") or [it["name"] for it in items],
        "money_saved_tenge": money_saved,
        "co2_prevented_kg": co2_prevented,
        "steps": steps,
        "eco_tip": str(data.get("eco_tip") or ""),
    }


def generate_recipe_fallback(items: list) -> dict:
    short_names = [re.split(r"[«,(]", it["name"])[0].strip() for it in items]
    money_saved = sum(it["price_tenge"] for it in items)
    co2_prevented = round(sum(it["weight_kg"] for it in items) * 2.5, 2)

    joined = " ".join(short_names).lower()
    if "фарш" in joined:
        title = "Запеканка из спасенных продуктов с фаршем и шпинатом"
    elif "курин" in joined or "филе" in joined:
        title = "Сытное рагу из спасенного куриного филе"
    elif any(word in joined for word in ("молок", "сметан", "творог", "кефир")):
        title = "Нежная молочная запеканка «Zero Waste»"
    elif any(word in joined for word in ("томат", "шпинат", "овощ")):
        title = "Овощное рагу из спасенных продуктов"
    else:
        title = "Блюдо Zero Waste из спасенных продуктов"

    ingredients_text = ", ".join(short_names) if short_names else "спасенные продукты"
    steps = [
        f"Достаньте из холодильника: {ingredients_text} — их нужно использовать первыми.",
        "Нарежьте все ингредиенты небольшими кусочками и обжарьте на среднем огне 5-7 минут до мягкости.",
        "Добавьте соль, перец и немного чеснока по вкусу, готовьте ещё 5 минут, периодически помешивая.",
        "Переложите в форму для запекания, посыпьте остатками сыра или сметаны и запекайте 10-12 минут при 180°C.",
        "Подавайте горячим — вы спасли продукты от мусорного полигона и сэкономили семейный бюджет!",
    ]

    money_str = f"{money_saved:,}".replace(",", " ")
    eco_tip = (
        f"Это блюдо спасло {money_str} ₸ семейного бюджета и предотвратило выброс около "
        f"{co2_prevented} кг CO₂-экв метана на полигоне Астаны — именно столько выделяют "
        "испорченные продукты, если попадают на свалку вместо тарелки."
    )

    return {
        "title": title,
        "cooking_time_min": 20 + 5 * max(0, len(items) - 3),
        "used_ingredients": short_names,
        "money_saved_tenge": money_saved,
        "co2_prevented_kg": co2_prevented,
        "steps": steps,
        "eco_tip": eco_tip,
    }


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {"message": "EcoFridge AI API", "docs": "/docs"}
