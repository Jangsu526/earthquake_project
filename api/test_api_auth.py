"""Offline logic tests: no framework server, TensorFlow load or database writes.

Run: python3 -m unittest api.test_api_auth -v
The real ASGI/HTTP and PostgreSQL checks remain a separate integration step.
"""
import ast
import asyncio
import json
import os
from pathlib import Path
import secrets
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


class TestApiAuthentication(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("main.py").read_text()
        names = {"authenticate_api_requests", "health", "predict_earthquake", "read_predictions"}
        tree = ast.parse(source)
        functions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
        self.assertEqual({node.name for node in functions}, names)
        for node in functions:
            node.decorator_list = []
        self.save = Mock(return_value=123)
        self.rows = [{"id": 123, "sample_id": "auth-test", "prediction_class": 2, "confidence": 0.9}]
        self.get = Mock(return_value=self.rows)
        self.predict = Mock(return_value="mock-output")
        self.ns = {
            "os": os, "secrets": secrets, "Request": object, "WaveformInput": object,
            "JSONResponse": lambda *, status_code, content: SimpleNamespace(status_code=status_code, content=content),
            "model": object(), "validate_waveform": Mock(return_value="validated-waveform"),
            "predict": self.predict, "prediction_report": Mock(return_value=(2, 0.9)),
            "save_prediction": self.save, "get_predictions": self.get,
            "psycopg": SimpleNamespace(OperationalError=RuntimeError),
            "logger": Mock(),
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(Path(__file__).with_name("main.py")), "exec"), self.ns)

    def request(self, path, server_key, supplied=None, downstream=None):
        headers = {} if supplied is None else {"X-API-Key": supplied}
        request = SimpleNamespace(url=SimpleNamespace(path=path), headers=headers)
        reached = Mock()

        async def call_next(_):
            reached()
            return downstream() if downstream else SimpleNamespace(status_code=200)

        with patch.dict(os.environ, {}, clear=True):
            if server_key is not None:
                os.environ["FASTAPI_API_KEY"] = server_key
            response = asyncio.run(self.ns["authenticate_api_requests"](request, call_next))
        return response, reached

    def test_public_health_with_and_without_server_key(self):
        for key in [None, "", "test-only-key"]:
            with self.subTest(configured=bool(key)):
                response, reached = self.request("/health", key, downstream=self.ns["health"])
                self.assertEqual(response, {"status": "ok"})
                reached.assert_called_once()

    def test_protected_paths_reject_missing_wrong_and_unconfigured_keys(self):
        for path in ["/predict", "/predictions", "/predict/", "/predictions/"]:
            for expected, supplied in [("test-only-key", None), ("test-only-key", "wrong-key"), ("test-only-key", ""), (None, "test-only-key"), ("", "test-only-key"), ("   ", "   ")]:
                with self.subTest(path=path, configured=bool(expected), header_present=bool(supplied)):
                    response, reached = self.request(path, expected, supplied)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.content, {"detail": "Unauthorized"})
                    reached.assert_not_called()
        self.predict.assert_not_called()
        self.save.assert_not_called()
        self.get.assert_not_called()

    def test_authentication_happens_before_json_parsing(self):
        response, reached = self.request("/predict", "test-only-key", downstream=lambda: json.loads("{"))
        self.assertEqual(response.status_code, 401)
        reached.assert_not_called()

    def test_valid_key_uses_constant_time_comparison(self):
        for path in ["/predict", "/predictions"]:
            with patch.object(secrets, "compare_digest", wraps=secrets.compare_digest) as compare:
                response, reached = self.request(path, "test-only-key", "test-only-key")
                self.assertEqual(response.status_code, 200)
                reached.assert_called_once()
                compare.assert_called_once()

    def test_non_ascii_header_is_rejected_without_comparison_error(self):
        response, reached = self.request("/predict", "test-only-key", "잘못된-키")
        self.assertEqual(response.status_code, 401)
        reached.assert_not_called()

    def test_authorized_prediction_preserves_save_contract_with_mock_database(self):
        data = SimpleNamespace(sample_id="auth-test", waveform=[[0, 0, 0]] * 1000)
        response, reached = self.request("/predict", "test-only-key", "test-only-key", lambda: self.ns["predict_earthquake"](data))
        reached.assert_called_once()
        self.predict.assert_called_once_with(self.ns["model"], "validated-waveform")
        self.save.assert_called_once_with(sample_id="auth-test", model_name="proposed_v1", prediction_class=2, confidence=0.9)
        self.assertEqual(response, {"id": 123, "sample_id": "auth-test", "prediction_class": 2, "confidence": 0.9})

    def test_authorized_history_preserves_database_contract_with_mock_database(self):
        response, reached = self.request("/predictions", "test-only-key", "test-only-key", lambda: self.ns["read_predictions"](10))
        reached.assert_called_once()
        self.get.assert_called_once_with(10)
        self.assertEqual(response, {"count": 1, "predictions": self.rows})


if __name__ == "__main__":
    unittest.main()
