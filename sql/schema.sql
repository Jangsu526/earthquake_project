CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id TEXT,
    model_name TEXT NOT NULL,
    prediction_class INTEGER,
    confidence REAL,
    actual_class INTEGER,
    error_status INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);