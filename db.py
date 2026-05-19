"""SQLite connection helpers."""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "maverick.db")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def get_conn():
    """Get a fresh connection with row factory set to sqlite3.Row."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create schema if it doesn't exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(SCHEMA_PATH) as f:
        schema = f.read()
    conn = get_conn()
    try:
        conn.executescript(schema)
        conn.commit()
    finally:
        conn.close()


def is_seeded():
    """Check if the database already has core data."""
    try:
        conn = get_conn()
        cur = conn.execute("SELECT COUNT(*) AS c FROM containers")
        row = cur.fetchone()
        conn.close()
        return row["c"] > 0
    except Exception:
        return False
