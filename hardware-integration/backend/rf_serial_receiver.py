"""
Isolated RF USB Serial Receiver Bridge.
Location: hardware-integration/backend/rf_serial_receiver.py

Scans for genuine USB serial devices (ignoring virtual Bluetooth COM ports),
reads incoming RF packets, validates JSON, and stores them in the isolated database.

Usage:
  python rf_serial_receiver.py
  python rf_serial_receiver.py --port COM3 --baud 115200
  python rf_serial_receiver.py --list-ports
"""

import sys
import time
import json
import argparse
from typing import List, Optional

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

from database import insert_reading


def find_usb_serial_ports() -> List[str]:
    """List only real USB hardware serial ports, skipping Bluetooth links."""
    if not serial:
        print("[Warning] pyserial is not installed. Run: pip install pyserial")
        return []

    available = []
    for port in serial.tools.list_ports.comports():
        desc = (port.description or "").lower()
        hwid = (port.hwid or "").lower()

        # Filter out virtual Bluetooth COM links that cause 'Failed to open' errors
        if "bluetooth" in desc or "bthenum" in hwid:
            continue

        available.append(port.device)
        print(f"  [Found USB Port] {port.device} - {port.description}")

    return available


def listen_serial(port_name: Optional[str] = None, baud_rate: int = 115200):
    if not serial:
        print("[Error] pyserial library is required. Run: pip install pyserial")
        sys.exit(1)

    if not port_name or port_name == "AUTO":
        ports = find_usb_serial_ports()
        if not ports:
            print("[Info] No active USB Serial Arduino detected.")
            print("       Make sure the Arduino receiver is connected with a USB Data cable.")
            return
        port_name = ports[0]
        print(f"[Auto-Selected] {port_name}")

    print(f"[Connecting] Opening {port_name} at {baud_rate} baud...")
    try:
        ser = serial.Serial(port=port_name, baudrate=baud_rate, timeout=2.0)
        time.sleep(2.0)  # Allow Arduino to reset upon connection
        print(f"[Connected] Successfully listening on {port_name}!")
        print("  Press Ctrl+C to stop.")
    except Exception as err:
        print(f"[Error] Failed to open {port_name}: {err}")
        print("  Tip: Make sure Arduino IDE Serial Monitor is closed.")
        return

    while True:
        try:
            line = ser.readline().decode("utf-8", errors="replace").strip()
            if not line:
                continue

            start = line.find("{")
            end = line.rfind("}")
            if start == -1 or end == -1 or end <= start:
                # Debug non-json string from Arduino
                print(f"[Hardware Log] {line}")
                continue

            json_text = line[start : end + 1]
            try:
                packet = json.loads(json_text)
            except json.JSONDecodeError:
                continue

            saved = insert_reading(packet)
            print(
                f"[RF Telemetry Saved] Temp: {saved['temperature']}°C | "
                f"Hum: {saved['humidity']}% | Soil: {saved['soil_moisture']}% | "
                f"Water: {saved['water_level']}% | Motion: {saved['motion']}"
            )

        except KeyboardInterrupt:
            print("\n[Stopped] Closing serial port...")
            ser.close()
            break
        except Exception as e:
            print(f"[Warning] Serial read exception: {e}")
            time.sleep(1.0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Plant Doctor Isolated RF Serial Receiver")
    parser.add_argument("--port", type=str, default="AUTO", help="COM port (e.g. COM3) or AUTO")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default 115200)")
    parser.add_argument("--list-ports", action="store_true", help="List connected USB ports and exit")
    args = parser.parse_args()

    if args.list_ports:
        print("[Available USB Ports]:")
        ports = find_usb_serial_ports()
        if not ports:
            print("  (No USB serial devices detected)")
        sys.exit(0)

    listen_serial(args.port, args.baud)
