# запускать командой:
# Запустить сервер
# uvicorn main:app --port 8000

# перезпуск сервера при изменении базы данных (и не только):
# uvicorn main:app --reload

# адрес сайта:
# http://127.0.0.1:8000/docs



from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from api.database import init_db
from api.routes import router

# --- Создание приложения ---
app = FastAPI(
    title="Справочник станций мониторинга окружающей среды",
    description="REST API для получения данных о станциях экологического мониторинга",
    version="1.0.0",
)

# --- Настройка CORS ---
# CORS (Cross-Origin Resource Sharing) — механизм безопасности браузера.
# Браузер блокирует AJAX-запросы, если JS-скрипт и API находятся на разных
# "источниках" (origin = протокол + домен + порт).
# Например, index.html открыт с file:// или localhost:5500,
# а API работает на localhost:8000 — это РАЗНЫЕ источники.
# Middleware ниже добавляет заголовки, которые РАЗРЕШАЮТ такие запросы.
# В продакшене замените ["*"] на конкретный домен фронтенда.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # Разрешить запросы с любого источника
    allow_credentials=True,
    allow_methods=["GET"],    # Наш API только читает данные, POST не нужен
    allow_headers=["*"],
)

# --- Инициализация БД при старте ---
@app.on_event("startup")
def on_startup():
    init_db()

# --- Подключение роутера API ---
app.include_router(router)

# --- Раздача статических файлов (HTML, CSS, JS) ---
# FastAPI будет отдавать файлы из папки static/ по пути /static/...
# Но мы хотим, чтобы / (корень) открывал index.html.
# Поэтому монтируем статику ПОСЛЕ всех API-маршрутов.
static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")