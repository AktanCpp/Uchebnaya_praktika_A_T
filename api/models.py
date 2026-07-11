from pydantic import BaseModel, Field
from typing import List


class StationOut(BaseModel):
    """
    Pydantic-модель описывает форму данных, которую API отдаёт клиенту.
    FastAPI автоматически сериализует её в JSON и генерирует документацию.
    """
    id: int
    name: str
    code: str
    location: str
    city: str
    latitude: float
    longitude: float
    parameters: List[str]   # В ответе API — уже список Python, не строка JSON
    description: str

    class Config:
        # Разрешает Pydantic читать данные из объектов с атрибутами (sqlite3.Row)
        from_attributes = True