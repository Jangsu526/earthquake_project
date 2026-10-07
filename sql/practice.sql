-- 전체 예측 조회
SELECT * FROM predictions;

-- confidence 0.8 이상만 조회
SELECT *
FROM predictions
WHERE confidence >= 0.8;

-- confidence 높은 순서대로 정렬
SELECT *
FROM predictions
ORDER BY confidence DESC;

SELECT prediction_class, confidence
FROM predictions;

SELECT prediction_class, confidence
FROM predictions
WHERE confidence >= 0.8;

SELECT COUNT(*)
FROM predictions;

SELECT AVG(confidence)
FROM predictions;

SELECT MAX(confidence)
FROM predictions;

SELECT MIN(confidence)
FROM predictions;

SELECT prediction_class, AVG(confidence)
FROM predictions
GROUP BY prediction_class;

-- INSERT INTO predictions (prediction_class, confidence)
-- VALUES
--     (0, 0.91),
--     (0, 0.87),
--     (1, 0.79),
--     (2, 0.93);

SELECT prediction_class, COUNT(*)
FROM predictions
GROUP BY prediction_class;