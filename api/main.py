import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from src.inference import (
    load_model,
    predict,
    prediction_report,
    MODEL_PATH
)


app = FastAPI()

# 서버 시작 시 모델을 한 번 로드
model = load_model(MODEL_PATH)


class WaveformInput(BaseModel):
    waveform: list[list[float]]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict_earthquake(data: WaveformInput):
    try:
        sample = np.array(data.waveform)

        prediction = predict(model, sample)

        prediction_class, confidence = prediction_report(prediction)

        return {
            "prediction_class": int(prediction_class),
            "confidence": float(confidence)
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )