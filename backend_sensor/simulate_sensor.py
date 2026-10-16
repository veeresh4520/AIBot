"""
Sensor Simulator for Plant Doctor Field Sensors.

Sends simulated sensor readings periodically or on-demand to test the local backend
and dashboard without requiring physical LoRa hardware.

Usage:
    python simulate_sensor.py --interval 5 --count 10
    python simulate_sensor.py --once --temp 34.5 --hum 42.0 --motion
"""

import time
import json
import random
import argparse
import requests


def send_reading(url: str, device_id: str, temp: float, hum: float, motion: bool, soil_moisture: float = 50.0, water_level: float = 75.0, is_simulated: bool = True):
    payload = {
        "device_id": device_id,
        "temperature": round(temp, 1),
        "humidity": round(hum, 1),
        "soil_moisture": round(soil_moisture, 1),
        "water_level": round(water_level, 1),
        "motion": bool(motion),
        "is_simulated": is_simulated,
    }
    try:
        res = requests.post(url, json=payload, timeout=3.0)
        if res.status_code in (200, 201):
            print(f"[SIMULATOR -> OK] {payload} -> Response: {res.json().get('status')}")
            return True
        else:
            print(f"[SIMULATOR -> FAIL] {payload} -> {res.status_code}: {res.text}")
            return False
    except Exception as ex:
        print(f"[SIMULATOR -> ERROR] Could not connect to {url}: {ex}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Plant Doctor Sensor Simulator")
    parser.add_argument("--url", default="http://127.0.0.1:5000/api/sensor-readings", help="Endpoint URL")
    parser.add_argument("--device", default="SIM_FIELD_01", help="Device ID")
    parser.add_argument("--interval", type=float, default=4.0, help="Seconds between readings in loop mode")
    parser.add_argument("--count", type=int, default=0, help="Number of readings to send (0 = infinite)")
    parser.add_argument("--once", action="store_true", help="Send a single reading and exit")
    parser.add_argument("--temp", type=float, default=None, help="Explicit temperature override")
    parser.add_argument("--hum", type=float, default=None, help="Explicit humidity override")
    parser.add_argument("--soil", type=float, default=None, help="Explicit soil moisture override (%)")
    parser.add_argument("--water", type=float, default=None, help="Explicit water level override (%)")
    parser.add_argument("--motion", action="store_true", help="Explicit motion trigger")

    args = parser.parse_args()

    if args.once:
        t = args.temp if args.temp is not None else round(random.uniform(24.0, 35.0), 1)
        h = args.hum if args.hum is not None else round(random.uniform(45.0, 80.0), 1)
        s = args.soil if args.soil is not None else round(random.uniform(35.0, 75.0), 1)
        w = args.water if args.water is not None else round(random.uniform(45.0, 90.0), 1)
        m = args.motion
        send_reading(args.url, args.device, t, h, m, soil_moisture=s, water_level=w)
        return

    print(f"Starting Sensor Simulator sending to {args.url} every {args.interval}s. Press Ctrl+C to stop.")
    sent = 0
    try:
        while True:
            t = args.temp if args.temp is not None else round(random.uniform(22.0, 37.0), 1)
            h = args.hum if args.hum is not None else round(random.uniform(35.0, 88.0), 1)
            s = args.soil if args.soil is not None else round(random.uniform(30.0, 78.0), 1)
            w = args.water if args.water is not None else round(random.uniform(40.0, 95.0), 1)
            # 25% chance of motion detection
            m = args.motion if args.motion else random.random() < 0.25

            send_reading(args.url, args.device, t, h, m, soil_moisture=s, water_level=w)
            sent += 1
            if args.count > 0 and sent >= args.count:
                print(f"Sent {sent} readings. Done.")
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nSimulator stopped by user.")


if __name__ == "__main__":
    main()
