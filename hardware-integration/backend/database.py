"""
Isolated Database Module for Hardware RF Sensor Integration.
Location: hardware-integration/backend/database.py
Stores received RF sensor packets in a separate hardware_sensors.db file.
"""

import os
import sqlite3
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "hardware_sensors.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hardware_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                soil_moisture REAL DEFAULT 50.0,
                water_level REAL DEFAULT 75.0,
                motion INTEGER NOT NULL,
                rf_link TEXT DEFAULT '433MHZ',
                seq INTEGER DEFAULT 0,
                is_simulated INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_hw_created_at ON hardware_readings(created_at DESC)"
        )
    conn.close()


def insert_reading(data: Dict[str, Any]) -> Dict[str, Any]:
    created_at = data.get("created_at") or datetime.now(timezone.utc).isoformat()
    device_id = str(data.get("device_id") or "RF_FIELD_01")
    temperature = float(data.get("temperature", data.get("temp", 26.5)))
    humidity = float(data.get("humidity", data.get("hum", 58.0)))
    soil_moisture = float(data.get("soil_moisture", data.get("soil", 50.0)))
    water_level = float(data.get("water_level", data.get("water", 75.0)))
    motion = 1 if data.get("motion") in (True, 1, "1", "true", "True") else 0
    rf_link = str(data.get("rf_link") or "433MHZ")
    seq = int(data.get("seq") or 0)
    is_simulated = 1 if data.get("is_simulated") else 0

    conn = get_db_connection()
    with conn:
        cursor = conn.execute(
            """
            INSERT INTO hardware_readings
            (device_id, temperature, humidity, soil_moisture, water_level, motion, rf_link, seq, is_simulated, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                device_id,
                temperature,
                humidity,
                soil_moisture,
                water_level,
                motion,
                rf_link,
                seq,
                is_simulated,
                created_at,
            ),
        )
        new_id = cursor.lastrowid
    conn.close()

    return {
        "id": new_id,
        "device_id": device_id,
        "temperature": temperature,
        "humidity": humidity,
        "soil_moisture": soil_moisture,
        "water_level": water_level,
        "motion": bool(motion),
        "rf_link": rf_link,
        "seq": seq,
        "is_simulated": bool(is_simulated),
        "created_at": created_at,
    }


def get_latest_reading() -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM hardware_readings ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "device_id": row["device_id"],
        "temperature": row["temperature"],
        "humidity": row["humidity"],
        "soil_moisture": row["soil_moisture"],
        "water_level": row["water_level"],
        "motion": bool(row["motion"]),
        "rf_link": row["rf_link"],
        "seq": row["seq"],
        "is_simulated": bool(row["is_simulated"]),
        "created_at": row["created_at"],
    }


def get_readings_history(limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT * FROM hardware_readings ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "device_id": r["device_id"],
            "temperature": r["temperature"],
            "humidity": r["humidity"],
            "soil_moisture": r["soil_moisture"],
            "water_level": r["water_level"],
            "motion": bool(r["motion"]),
            "rf_link": r["rf_link"],
            "seq": r["seq"],
            "is_simulated": bool(r["is_simulated"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


# Initialize schema on load
init_db()
