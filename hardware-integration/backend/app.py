"""
Isolated Backend Server for Plant Doctor Hardware RF Sensor Integration.
Location: hardware-integration/backend/app.py
Runs on port 5050 to prevent any collision with port 5000 or the existing project.
"""

import os
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from database import insert_reading, get_latest_reading, get_readings_history

DASHBOARD_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "dashboard")
)

app = Flask(__name__, static_folder=DASHBOARD_DIR)
CORS(app)


@app.route("/")
def serve_dashboard():
    """Serve the standalone hardware test dashboard."""
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    """Serve static assets for standalone dashboard."""
    return send_from_directory(DASHBOARD_DIR, path)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "service": "PlantDoctor Isolated Hardware Integration Service",
            "port": 5050,
            "version": "1.0.0",
        }
    )


@app.route("/api/sensor-readings/latest", methods=["GET"])
def get_latest():
    reading = get_latest_reading()
    return jsonify({"status": "ok", "reading": reading})


@app.route("/api/sensor-readings/history", methods=["GET"])
def get_history():
    limit = request.args.get("limit", default=50, type=int)
    readings = get_readings_history(limit)
    return jsonify({"status": "ok", "readings": readings})


@app.route("/api/sensor-readings", methods=["POST"])
def post_reading():
    data = request.get_json(silent=True) or {}
    required = ["temperature"]
    # Allow aliases
    if "temperature" not in data and "temp" in data:
        data["temperature"] = data["temp"]

    if "temperature" not in data:
        return jsonify({"status": "error", "message": "Missing temperature field"}), 400

    saved = insert_reading(data)
    return jsonify({"status": "success", "data": saved}), 201


@app.route("/api/sensor-readings/simulate", methods=["POST"])
def simulate():
    import random
    from datetime import datetime, timezone

    overrides = request.get_json(silent=True) or {}
    sim_data = {
        "device_id": overrides.get("device_id", "SIM_RF_01"),
        "temperature": overrides.get(
            "temperature", round(random.uniform(22.0, 36.0), 1)
        ),
        "humidity": overrides.get("humidity", round(random.uniform(40.0, 85.0), 1)),
        "soil_moisture": overrides.get(
            "soil_moisture", round(random.uniform(35.0, 75.0), 1)
        ),
        "water_level": overrides.get(
            "water_level", round(random.uniform(40.0, 95.0), 1)
        ),
        "motion": overrides.get("motion", random.random() < 0.3),
        "rf_link": "433MHZ",
        "seq": overrides.get("seq", random.randint(1, 9999)),
        "is_simulated": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    saved = insert_reading(sim_data)
    return jsonify({"status": "success", "data": saved}), 201


if __name__ == "__main__":
    print("=" * 65)
    print("  PlantDoctor Isolated Hardware Integration Backend")
    print("  Port: 5050 (Isolated from existing app)")
    print("  Standalone Dashboard: http://localhost:5050")
    print("=" * 65)
    app.run(host="0.0.0.0", port=5050, debug=False)
