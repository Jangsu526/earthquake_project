import os
import unittest
from unittest.mock import patch

from src.database import get_connection


class GetConnectionTests(unittest.TestCase):
    @patch("src.database.psycopg.connect")
    def test_database_url_takes_priority_without_db_password(self, connect):
        url = "postgresql://example:secret@example.invalid/earthquake_ai?sslmode=require"
        with patch.dict(os.environ, {"DATABASE_URL": url, "DB_HOST": "db"}, clear=True):
            connection = get_connection()
        connect.assert_called_once_with(url)
        self.assertIs(connection, connect.return_value)

    @patch("src.database.psycopg.connect")
    def test_legacy_docker_connection(self, connect):
        with patch.dict(os.environ, {"DB_HOST": "db", "DB_PASSWORD": "test-password"}, clear=True):
            connection = get_connection()
        connect.assert_called_once_with(
            host="db", dbname="earthquake_ai", user="earthquake_app", password="test-password"
        )
        self.assertIs(connection, connect.return_value)

    @patch("src.database.psycopg.connect")
    def test_empty_url_uses_localhost_default(self, connect):
        with patch.dict(os.environ, {"DATABASE_URL": "", "DB_PASSWORD": "test-password"}, clear=True):
            get_connection()
        connect.assert_called_once_with(
            host="localhost", dbname="earthquake_ai", user="earthquake_app", password="test-password"
        )

    @patch("src.database.psycopg.connect")
    def test_legacy_connection_still_requires_password(self, connect):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(KeyError):
                get_connection()
        connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
