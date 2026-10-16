"""
LoRa Receiver Serial Bridge for Plant Doctor Field Sensors.

Connects to a USB/UART LoRa Receiver module (e.g. ESP32 LoRa receiver or SX1276/SX1278 module),
reads incoming telemetry lines, and posts them to the local Flask backend.

Usage:
    python lora_receiver.py --port COM3 --baud 115200 --url http://127.0.0.1:5000/api/sensor-readings
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
    """List all available serial COM ports."""
    if not serial:
        return []
    return [p.device for p in serial.tools.list_ports.comports()]


def parse_and_forward(line_str: str, backend_url: str):
    """Parse JSON line and forward to local Flask backend."""
    line_str = line_str.strip()
    if not line_str:
        return

    # Attempt to locate JSON boundary
    start_idx = line_str.find("{")
    end_idx = line_str.rfind("}")
    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        print(f"[LoRa] Ignored non-JSON line: {line_str}")
        return

    json_str = line_str[start_idx : end_idx + 1]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as err:
        print(f"[LoRa] JSON parse error: {err} from line: {line_str}")
        return

    # Ensure is_simulated flag is false for real LoRa hardware
    if "is_simulated" not in data:
        data["is_simulated"] = False

    try:
        response = requests.post(backend_url, json=data, timeout=3.0)
        if response.status_code in (200, 201):
            print(f"[LoRa -> Backend] SUCCESS ({response.status_code}): {data}")
        else:
            print(f"[LoRa -> Backend] FAILED ({response.status_code}): {response.text}")
    except requests.exceptions.RequestException as req_err:
        print(f"[LoRa -> Backend] Network Error connecting to {backend_url}: {req_err}")


def run_bridge(port: str, baud: int, backend_url: str):
    """Continuously read from serial and dispatch to local service."""
    if serial is None:
        print("ERROR: 'pyserial' package is required. Run: pip install pyserial")
        sys.exit(1)

    print(f"=== Plant Doctor LoRa Receiver Bridge ===")
    print(f"Target Serial Port : {port}")
    print(f"Baud Rate          : {baud}")
    print(f"Local Backend URL  : {backend_url}")
    print("Press Ctrl+C to stop.\n")

    while True:
        try:
            print(f"Opening serial port {port}...")
            with serial.Serial(port, baudrate=baud, timeout=1.0) as ser:
                print(f"Connected to {port}. Listening for LoRa sensor packets...")
                while True:
                    line = ser.readline()
                    if line:
                        try:
                            decoded = line.decode("utf-8", errors="replace")
                            parse_and_forward(decoded, backend_url)
                        except Exception as ex:
                            print(f"[LoRa Error] Reading stream: {ex}")
        except serial.SerialException as s_err:
            print(f"Serial port error on {port}: {s_err}")
            print("Retrying connection in 3 seconds... (Is device connected?)")
            time.sleep(3.0)
        except KeyboardInterrupt:
            print("\nLoRa Bridge stopped by user.")
            break


def main():
    parser = argparse.ArgumentParser(description="Plant Doctor LoRa Receiver Serial Bridge")
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
            print(" (None detected)")
        return

    port = args.port
    if not port:
        ports = find_available_ports()
        if ports:
            port = ports[0]
            print(f"Auto-selected detected port: {port}")
        else:
            port = "COM3"
            print(f"No active port detected; defaulting to {port}")

    run_bridge(port, args.baud, args.url)


if __name__ == "__main__":
    main()
