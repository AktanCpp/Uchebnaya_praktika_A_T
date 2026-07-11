import json
from typing import List, Optional
from fastapi import APIRouter, Query
from .database import get_connection
from .models import StationOut

router = APIRouter(prefix="/api", tags=["stations"])


def row_to_station(row) -> StationOut:
    """
    Конвертирует строку из БД в Pydantic-модель.
    Десериализует поле parameters из JSON-строки в список Python.
    """
    data = dict(row)
    data["parameters"] = json.loads(data["parameters"])
    return StationOut(**data)


@router.get("/stations", response_model=List[StationOut])
def get_stations(
    search: Optional[str] = Query(None, description="Поиск по названию или городу"),
    parameter: Optional[str] = Query(None, description="Фильтр по контролируемому параметру"),
):
    """
    Возвращает список всех станций с возможностью фильтрации.

    Query-параметры передаются в URL, например:
      GET /api/stations?search=Бишкек
      GET /api/stations?parameter=CO2
      GET /api/stations?search=Ош&parameter=NOx
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Базовый запрос
    sql = "SELECT * FROM stations WHERE 1=1"
    params: list = []

    # Фильтр по названию или городу (регистронезависимый поиск через LIKE)
    if search:
        sql += " AND (name LIKE ? OR city LIKE ?)"
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard])

    # Фильтр по параметру: ищем подстроку в JSON-поле
    # Это безопасно, т.к. используем параметризованный запрос (?)
    if parameter:
        sql += " AND parameters LIKE ?"
        params.append(f"%{parameter}%")

    sql += " ORDER BY id"

    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()

    return [row_to_station(row) for row in rows]


@router.get("/stations/{station_id}", response_model=StationOut)
def get_station(station_id: int):
    """
    Возвращает одну станцию по её ID.
    FastAPI автоматически вернёт 422, если station_id — не целое число.
    """
    from fastapi import HTTPException

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stations WHERE id = ?", (station_id,))
    row = cursor.fetchone()
    conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Станция не найдена")

    return row_to_station(row)