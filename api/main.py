import uuid
import numpy as np
from src.database import save_prediction, get_predictions
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.inference import (
    load_model,
    predict,
    prediction_report,
    MODEL_PATH
)
import logging
import psycopg

logger = logging.getLogger(__name__)

app = FastAPI()

model = load_model(MODEL_PATH)


class WaveformInput(BaseModel):
    waveform: list[list[float]]
    sample_id: str | None = None

def validate_waveform(waveform):
    sample = np.asarray(waveform, dtype=np.float32)

    if sample.shape != (1000, 3):
        raise HTTPException(
            status_code=422,
            detail=f"Expected waveform shape (1000, 3), got {sample.shape}"
        )

    if not np.isfinite(sample).all():
        raise HTTPException(
            status_code=422,
            detail="Waveform contains NaN or Infinity"
        )

    return sample

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict_earthquake(data: WaveformInput):
    try:
        sample = validate_waveform(data.waveform)

        prediction = predict(model, sample)

        prediction_class, confidence = prediction_report(prediction)

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    sample_id = data.sample_id or f"API_{uuid.uuid4().hex[:12]}"

    try:
        prediction_id = save_prediction(
            sample_id=sample_id,
            model_name="proposed_v1",
            prediction_class=int(prediction_class),
            confidence=float(confidence)
        )
    except psycopg.OperationalError:
        logger.exception("Database connection failed during prediction save")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable"
        )

    return {
        "id": prediction_id,
        "sample_id": sample_id,
        "prediction_class": int(prediction_class),
        "confidence": float(confidence)
    }

@app.get("/predictions")
def read_predictions(limit: int = 10):
    if not 1 <= limit <= 100:
        raise HTTPException(
            status_code=400,
            detail="limit must be between 1 and 100"
        )

    try:
        records = get_predictions(limit)
    except psycopg.OperationalError:
        logger.exception("Database connection failed")
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable"
        )

    return {
        "count": len(records),
        "predictions": records
    }