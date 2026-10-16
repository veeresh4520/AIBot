"""
USB Serial Receiver Bridge for Plant Doctor Field Sensors.

Connects to an Arduino, ESP32, or Raspberry Pi Pico via USB Cable,
reads incoming sensor telemetry JSON lines, and posts them to the local Flask backend.

Usage:
    python serial_receiver.py --port COM3 --baud 115200
    python serial_receiver.py --list-ports
"""

import sys
import time
import json
import argparse
import requests

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None


def find_available_ports():
    """List all connected USB Serial / COM ports."""
    if not serial:
        return []
    return [p.device for p in serial.tools.list_ports.comports()]


def parse_and_forward(line_str: str, backend_url: str):
    """Parse incoming JSON line from Arduino/ESP32 and forward to Flask backend."""
    line_str = line_str.strip()
    if not line_str:
        return

    start_idx = line_str.find("{")
    end_idx = line_str.rfind("}")
    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        print(f"[Serial] Log: {line_str}")
        return

    json_str = line_str[start_idx : end_idx + 1]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as err:
        print(f"[Serial] JSON parse error: {err} from line: {line_str}")
        return

    if "is_simulated" not in data:
        data["is_simulated"] = False

    try:
        response = requests.post(backend_url, json=data, timeout=3.0)
        if response.status_code in (200, 201):
            print(f"[Hardware -> PlantDoctor OK] Temp: {data.get('temperature')}°C | Hum: {data.get('humidity')}% | Soil: {data.get('soil_moisture')}% | Water: {data.get('water_level')}% | Motion: {data.get('motion')}")
        else:
            print(f"[Hardware -> PlantDoctor FAIL] {response.status_code}: {response.text}")
    except requests.exceptions.RequestException as req_err:
        print(f"[Hardware -> PlantDoctor Error] Backend offline at {backend_url}: {req_err}")


def run_bridge(port: str, baud: int, backend_url: str):
    """Continuously read from USB Serial port and forward telemetry."""
    if serial is None:
        print("ERROR: 'pyserial' package is required. Run: pip install pyserial")
        sys.exit(1)

    print(f"=== Plant Doctor USB Hardware Sensor Bridge ===")
    print(f"Target USB Port   : {port}")
    print(f"Baud Rate         : {baud}")
    print(f"Local Backend URL : {backend_url}")
    print("Listening for sensor telemetry... Press Ctrl+C to stop.\n")

    while True:
        try:
            print(f"Connecting to {port}...")
            with serial.Serial(port, baudrate=baud, timeout=1.0) as ser:
                print(f"Connected to {port} successfully!")
                while True:
                    line = ser.readline()
                    if line:
                        try:
                            decoded = line.decode("utf-8", errors="replace")
                            parse_and_forward(decoded, backend_url)
                        except Exception as ex:
                            print(f"[Serial Error] Decoding error: {ex}")
        except serial.SerialException as s_err:
            print(f"Could not open {port}: {s_err}")
            print("Retrying in 3 seconds... (Is your Arduino/ESP32 plugged in?)")
            time.sleep(3.0)
        except KeyboardInterrupt:
            print("\nSerial Bridge stopped by user.")
            break


def main():
    parser = argparse.ArgumentParser(description="Plant Doctor USB Hardware Sensor Bridge")
    parser.add_argument("--port", type=str, default=None, help="Serial port (e.g. COM3, COM4, /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--url", type=str, default="http://127.0.0.1:5000/api/sensor-readings", help="Local backend endpoint")
    parser.add_argument("--list-ports", action="store_true", help="List available serial ports and exit")

    args = parser.parse_args()

    if args.list_ports:
        ports = find_available_ports()
        print("Available Serial Ports:")
        for p in ports:
            print(f" - {p}")
        if not ports:
            print(" (No serial devices detected)")
        return

    port = args.port
    if not port:
        ports = find_available_ports()
        if ports:
            port = ports[0]
            print(f"Auto-detected port: {port}")
        else:
            port = "COM3"
            print(f"No port specified, using default: {port}")

    run_bridge(port, args.baud, args.url)


if __name__ == "__main__":
    main()
