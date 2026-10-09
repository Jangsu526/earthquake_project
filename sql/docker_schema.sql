CREATE TABLE IF NOT EXISTS public.predictions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id VARCHAR(50) NOT NULL,
    model_name VARCHAR(50) NOT NULL,
    prediction_class INTEGER NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    actual_class INTEGER,
    error_status INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);