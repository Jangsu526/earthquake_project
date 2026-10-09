-- CREATE TABLE IF NOT EXISTS predictions (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     sample_id TEXT,
--     model_name TEXT NOT NULL,
--     prediction_class INTEGER,
--     confidence REAL,
--     actual_class INTEGER,
--     error_status INTEGER DEFAULT 0,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );


-- INSERT INTO predictions (
--     sample_id,
--     model_name,
--     prediction_class,
--     confidence
-- )
-- VALUES (
--     'STEAD_001',
--     'proposed_v1',
--     0,
--     0.9031
-- );


-- UPDATE predictions
-- SET actual_class = 0
-- WHERE id = 1;

SELECT *
FROM predictions;

SELECT
    prediction_class,
    COUNT(*) AS prediction_count
FROM predictions
GROUP BY prediction_class
HAVING COUNT(*) >= 2;

SELECT *
FROM predictions
WHERE DATE(created_at) = DATE('now');
