from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


class NumberInput(BaseModel):
    value: float


@app.post("/double")
def double_number(data: NumberInput):
    return {"result": data.value * 2}