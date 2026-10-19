"""The AI assistant."""
from typing import Annotated

from pydantic import BaseModel, StringConstraints


class AiQuestion(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class AiTemplate(BaseModel):
    id: str
    title: str
    example: str


class AiAnswer(BaseModel):
    template: str | None
    mode: str = "rules"  # rules | ai
    text: str
    columns: list[str]
    rows: list[list]
    link: str | None
    suggestions: list[str] = []


class AiStatus(BaseModel):
    mode: str  # rules | ai
    provider: str = "rules"  # rules | gemini | claude: which model understands free-form questions
    templates: list[AiTemplate]
    left_today: int
