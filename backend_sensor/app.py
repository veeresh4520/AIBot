import json
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flask import Flask, request, jsonify
from flask_cors import CORS
from database import init_db, insert_reading, get_latest_reading, get_readings_history, clear_readings

app = Flask(__name__)
# Enable CORS for local development and local Wi-Fi devices (e.g. mobile phones accessing via LAN IP)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Ensure database table exists on startup
init_db()


@app.route("/", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health_check():
    """Health status endpoint for dashboard connectivity checks."""
    return jsonify({
        "status": "ok",
        "service": "PlantDoctor Field Sensor Service",
        "version": "1.0.0",
        "storage": "SQLite local",
        "network": "local-only offline capable"
    }), 200


@app.route("/api/sensor-readings", methods=["POST"])
def ingest_reading():
    """
    Ingest a new reading received from LoRa receiver or local gateway.
    Expected JSON payload format:
    {
      "device_id": "FIELD_01",
      "temperature": 32.5,
      "humidity": 65.0,
      "motion": true | 1 | false | 0,
      "is_simulated": false (optional, defaults to false)
    }
    """
    if not request.is_json:
        # Fallback: try parsing raw string payload in case of raw text delivery
        try:
            payload = json.loads(request.get_data(as_text=True))
        except Exception:
            return jsonify({"status": "error", "message": "Request body must be valid JSON"}), 400
    else:
        payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"status": "error", "message": "Payload must be a JSON object"}), 400

    # 1. Validate device_id
    raw_device_id = payload.get("device_id")
    if not raw_device_id or not isinstance(raw_device_id, str):
        return jsonify({"status": "error", "message": "Missing or invalid 'device_id'"}), 422
    device_id = raw_device_id.strip()[:64]

    # 2. Validate temperature
    raw_temp = payload.get("temperature")
    try:
        temperature = float(raw_temp)
        if temperature < -40.0 or temperature > 85.0:
            return jsonify({"status": "error", "message": "Temperature out of realistic range (-40 to 85 °C)"}), 422
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Missing or non-numeric 'temperature'"}), 422

    # 3. Validate humidity
    raw_humidity = payload.get("humidity")
    try:
        humidity = float(raw_humidity)
        if humidity < 0.0 or humidity > 100.0:
            return jsonify({"status": "error", "message": "Humidity out of realistic range (0 to 100 %)"}), 422
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Missing or non-numeric 'humidity'"}), 422

    # 4. Validate motion
    # Handles: true, false, 1, 0, "true", "false", or presence of motion key
    raw_motion = payload.get("motion")
    if isinstance(raw_motion, bool):
        motion = raw_motion
    elif isinstance(raw_motion, (int, float)):
        motion = bool(raw_motion)
    elif isinstance(raw_motion, str):
        motion = raw_motion.lower().strip() in ("true", "1", "yes", "active", "detected")
    elif "motion" in payload:
        motion = True
    else:
        motion = False

    # 5. Extract soil_moisture (accepts "soil_moisture" or "soil")
    raw_soil = payload.get("soil_moisture", payload.get("soil"))
    try:
        soil_moisture = float(raw_soil) if raw_soil is not None else 50.0
        soil_moisture = max(0.0, min(100.0, soil_moisture))
    except (TypeError, ValueError):
        soil_moisture = 50.0

    # 6. Extract water_level (accepts "water_level" or "water")
    raw_water = payload.get("water_level", payload.get("water"))
    try:
        water_level = float(raw_water) if raw_water is not None else 75.0
        water_level = max(0.0, min(100.0, water_level))
    except (TypeError, ValueError):
        water_level = 75.0

    # 7. Distinguish real sensor data from simulated test data
    is_simulated = bool(payload.get("is_simulated", False))

    raw_payload_str = json.dumps(payload, separators=(",", ":"))

    saved = insert_reading(
        device_id=device_id,
        temperature=temperature,
        humidity=humidity,
        motion=motion,
        soil_moisture=soil_moisture,
        water_level=water_level,
        is_simulated=is_simulated,
        raw_payload=raw_payload_str,
    )

    return jsonify({
        "status": "success",
        "message": "Sensor reading recorded successfully",
        "data": saved
    }), 201


@app.route("/api/sensor-readings/latest", methods=["GET"])
def get_latest():
    """Retrieve the single most recent sensor reading."""
    reading = get_latest_reading()
    return jsonify({
        "status": "ok",
        "reading": reading
    }), 200


@app.route("/api/sensor-readings/history", methods=["GET"])
def get_history():
    """Retrieve history of recent sensor readings."""
    try:
        limit = int(request.args.get("limit", 50))
    except (ValueError, TypeError):
        limit = 50

    readings = get_readings_history(limit=limit)
    return jsonify({
        "status": "ok",
        "count": len(readings),
        "readings": readings
    }), 200


@app.route("/api/sensor-readings/simulate", methods=["POST"])
def simulate_reading():
    """
    Generate and record a simulated sensor reading for testing without hardware.
    Marks reading with is_simulated=True.
    """
    req_data = request.get_json(silent=True) or {}
    
    # Generate realistic field variations or use overrides
    sim_temp = float(req_data.get("temperature", round(random.uniform(22.0, 36.0), 1)))
    sim_hum = float(req_data.get("humidity", round(random.uniform(40.0, 88.0), 1)))
    sim_soil = float(req_data.get("soil_moisture", req_data.get("soil", round(random.uniform(35.0, 75.0), 1))))
    sim_water = float(req_data.get("water_level", req_data.get("water", round(random.uniform(45.0, 92.0), 1))))
    sim_motion = bool(req_data.get("motion", random.choice([True, False, False, False])))
    device_id = str(req_data.get("device_id", "SIM_FIELD_01")).strip()

    saved = insert_reading(
        device_id=device_id,
        temperature=sim_temp,
        humidity=sim_hum,
        motion=sim_motion,
        soil_moisture=sim_soil,
        water_level=sim_water,
        is_simulated=True,
        raw_payload=json.dumps({
            "device_id": device_id,
            "temperature": sim_temp,
            "humidity": sim_hum,
            "soil_moisture": sim_soil,
            "water_level": sim_water,
            "motion": sim_motion,
            "is_simulated": True
        })
    )

    return jsonify({
        "status": "success",
        "message": "Simulated test reading created",
        "data": saved
    }), 201


@app.route("/api/sensor-readings", methods=["DELETE"])
def delete_all():
    """Clear all readings for test cleanups."""
    deleted_count = clear_readings()
    return jsonify({
        "status": "ok",
        "deleted": deleted_count,
        "message": f"Cleared {deleted_count} sensor reading records"
    }), 200


if __name__ == "__main__":
    # Listen on all interfaces (0.0.0.0) so devices on the local Wi-Fi can reach the service
    print("Starting PlantDoctor Field Sensor Local Service on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False)
