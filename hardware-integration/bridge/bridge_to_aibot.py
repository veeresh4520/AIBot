"""
Plant Doctor - Optional Forwarding Bridge to Existing AIBot Backend.
Directory: hardware-integration/bridge/bridge_to_aibot.py

FUNCTION:
Forwards real-time hardware readings from the isolated hardware integration service (Port 5050)
to the existing Plant Doctor AIBot backend (Port 5000).

DOES NOT MODIFY ANY EXISTING CODE.
Runs as a separate user-controlled process only when you explicitly start it:
    python bridge_to_aibot.py
"""

import time
import requests

HARDWARE_SERVICE_URL = "http://localhost:5050/api/sensor-readings/latest"
EXISTING_AIBOT_BACKEND_URL = "http://localhost:5000/api/sensor-readings"

print("=" * 65)
print("  PlantDoctor Hardware -> AIBot Live Forwarding Bridge")
print(f"  Source (Hardware Service): {HARDWARE_SERVICE_URL}")
print(f"  Destination (AIBot App):   {EXISTING_AIBOT_BACKEND_URL}")
print("=" * 65)

last_forwarded_id = None

while True:
    try:
        res = requests.get(HARDWARE_SERVICE_URL, timeout=3.0)
        if res.ok:
            data = res.json()
            reading = data.get("reading")
            if reading and reading.get("id") != last_forwarded_id:
                # Forward reading to existing backend
                post_res = requests.post(EXISTING_AIBOT_BACKEND_URL, json=reading, timeout=3.0)
                if post_res.ok:
                    last_forwarded_id = reading.get("id")
                    print(f"[Forwarded OK -> AIBot /sensors] Temp: {reading['temperature']}°C | Soil: {reading['soil_moisture']}% | Motion: {reading['motion']}")
                else:
                    print(f"[Forward Fail] Existing backend returned HTTP {post_res.status_code}")
    except requests.exceptions.ConnectionError:
        print("[Waiting] Either hardware service (5050) or AIBot backend (5000) is offline...")
    except Exception as e:
        print(f"[Bridge Error]: {e}")

    time.sleep(3.0)
