import os
import psycopg

from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


# def get_connection():
#     return psycopg.connect(
#         host="localhost",
#         dbname="earthquake_ai",
#         user="earthquake_app",
#         password=os.environ["DB_PASSWORD"]
#     )

def get_connection():
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        dbname="earthquake_ai",
        user="earthquake_app",
        password=os.environ["DB_PASSWORD"]
    )

def get_predictions(limit: int = 10):
    sql = """
        SELECT id, sample_id, model_name,
               prediction_class, confidence, created_at
        FROM public.predictions
        ORDER BY id DESC
        LIMIT %s;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (limit,))
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "sample_id": row[1],
            "model_name": row[2],
            "prediction_class": row[3],
            "confidence": row[4],
            "created_at": row[5].isoformat()
        }
        for row in rows
    ]
def save_prediction(
    sample_id: str,
    model_name: str,
    prediction_class: int,
    confidence: float
) -> int:

    sql = """
        INSERT INTO public.predictions
            (sample_id, model_name, prediction_class, confidence)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                (
                    sample_id,
                    model_name,
                    prediction_class,
                    confidence
                )
            )

            prediction_id = cur.fetchone()[0]

    return prediction_id