import sqlite3
import os
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "field_sensors.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the SQLite schema for field sensor readings."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                motion INTEGER NOT NULL,
                soil_moisture REAL DEFAULT 50.0,
                water_level REAL DEFAULT 75.0,
                is_simulated INTEGER NOT NULL DEFAULT 0,
                raw_payload TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sensor_created_at ON sensor_readings(created_at DESC)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sensor_device_id ON sensor_readings(device_id)"
        )
        # Migrate existing table if columns don't exist yet
        try:
            cursor.execute("ALTER TABLE sensor_readings ADD COLUMN soil_moisture REAL DEFAULT 50.0")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE sensor_readings ADD COLUMN water_level REAL DEFAULT 75.0")
        except Exception:
            pass
        conn.commit()
    finally:
        conn.close()


def insert_reading(
    device_id: str,
    temperature: float,
    humidity: float,
    motion: bool | int,
    soil_moisture: Optional[float] = 50.0,
    water_level: Optional[float] = 75.0,
    is_simulated: bool = False,
    raw_payload: str = "",
) -> Dict[str, Any]:
    """Insert a new validated reading into the database."""
    now_iso = datetime.now(timezone.utc).isoformat()
    motion_val = 1 if motion else 0
    sim_val = 1 if is_simulated else 0
    soil_val = float(soil_moisture) if soil_moisture is not None else 50.0
    water_val = float(water_level) if water_level is not None else 75.0

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO sensor_readings (device_id, temperature, humidity, motion, soil_moisture, water_level, is_simulated, raw_payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (device_id, float(temperature), float(humidity), motion_val, soil_val, water_val, sim_val, raw_payload, now_iso),
        )
        reading_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()

    return {
        "id": reading_id,
        "device_id": device_id,
        "temperature": float(temperature),
        "humidity": float(humidity),
        "motion": bool(motion_val),
        "soil_moisture": soil_val,
        "water_level": water_val,
        "is_simulated": bool(sim_val),
        "created_at": now_iso,
    }


def get_latest_reading() -> Optional[Dict[str, Any]]:
    """Retrieve the single most recent sensor reading."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, device_id, temperature, humidity, motion, soil_moisture, water_level, is_simulated, raw_payload, created_at
            FROM sensor_readings
            ORDER BY id DESC
            LIMIT 1
            """
        )
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "device_id": row["device_id"],
            "temperature": row["temperature"],
            "humidity": row["humidity"],
            "motion": bool(row["motion"]),
            "soil_moisture": row["soil_moisture"] if "soil_moisture" in row.keys() and row["soil_moisture"] is not None else 50.0,
            "water_level": row["water_level"] if "water_level" in row.keys() and row["water_level"] is not None else 75.0,
            "is_simulated": bool(row["is_simulated"]),
            "raw_payload": row["raw_payload"],
            "created_at": row["created_at"],
        }
    finally:
        conn.close()


def get_readings_history(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve recent sensor readings history sorted newest first."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, device_id, temperature, humidity, motion, soil_moisture, water_level, is_simulated, raw_payload, created_at
            FROM sensor_readings
            ORDER BY id DESC
            LIMIT ?
            """,
            (max(1, min(limit, 500)),),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "device_id": r["device_id"],
                "temperature": r["temperature"],
                "humidity": r["humidity"],
                "motion": bool(r["motion"]),
                "soil_moisture": r["soil_moisture"] if "soil_moisture" in r.keys() and r["soil_moisture"] is not None else 50.0,
                "water_level": r["water_level"] if "water_level" in r.keys() and r["water_level"] is not None else 75.0,
                "is_simulated": bool(r["is_simulated"]),
                "raw_payload": r["raw_payload"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def clear_readings() -> int:
    """Clear readings table for test resets."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sensor_readings")
        deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()
