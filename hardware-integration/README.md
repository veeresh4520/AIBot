# Isolated Hardware Integration Suite

This directory contains the completely isolated hardware integration for reading real RF / Serial sensor telemetry from physical sensors.

> **CRITICAL ARCHITECTURAL GUARANTEE:**  
> This directory is 100% self-contained. It makes **zero modifications** to existing AIBot code, components, routes, styles, or dependencies.

---

## Directory Structure

```
hardware-integration/
├── firmware/
│   ├── rf_transmitter/
│   │   └── rf_transmitter.ino      # Field node firmware (5 sensors + RF transmitter)
│   ├── rf_receiver/
│   │   └── rf_receiver.ino         # USB Base station receiver firmware
│   └── wiring_diagram.md           # Pinouts, wiring tables, calibration notes
├── backend/
│   ├── app.py                      # Isolated Flask REST API (Port 5050)
│   ├── database.py                 # Isolated SQLite database (hardware_sensors.db)
│   ├── rf_serial_receiver.py       # USB listener with smart Bluetooth port filter
│   ├── config.json                 # Baud rate, port, and threshold configuration
│   └── requirements.txt            # Isolated Python dependencies
├── dashboard/
│   ├── index.html                  # Standalone test dashboard (zero-dependency)
│   ├── dashboard.js                # Live telemetry & Crop Condition logic
│   └── styles.css                  # Modern dark-mode interface
└── bridge/
    ├── bridge_to_aibot.py          # Optional forwarder to existing AIBot (Port 5000)
    └── INTEGRATION_PLAN.md         # Blueprint for connecting to existing /sensors
```

---

## Quick Start: Test the Hardware Dashboard Locally

### Option 1: Direct Web Dashboard (Zero Installation)
Simply double-click or open `hardware-integration/dashboard/index.html` in Google Chrome, Microsoft Edge, or Brave.
- Click **`+ Inject Test Packet`** to verify the real-time crop condition engine.
- Click **`🔌 Connect USB Hardware`** to connect directly to your plugged-in Arduino receiver over USB.

### Option 2: Run the Isolated Backend (Port 5050)
1. Open a terminal in the backend directory:
   ```powershell
   cd hardware-integration/backend
   ```
2. Install isolated dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
3. Start the isolated service:
   ```powershell
   python app.py
   ```
4. Open your browser at: **[http://localhost:5050](http://localhost:5050)**.

### Option 3: Run the USB Serial Listener
To listen directly on a USB COM port from your terminal:
```powershell
python hardware-integration/backend/rf_serial_receiver.py --list-ports
python hardware-integration/backend/rf_serial_receiver.py --port AUTO --baud 115200
```
*(Smart filtering automatically excludes virtual Bluetooth COM ports to avoid `Failed to open serial port` errors).*

---

## 5 Sensors Supported
1. **Temperature & Humidity**: DHT11 or DHT22 (Pin D2)
2. **Soil Moisture**: Analog Capacitive / Resistive (Pin A0)
3. **Water Level**: Ultrasonic HC-SR04 (Trig D4, Echo D5) or Analog (Pin A1)
4. **Perimeter Motion**: PIR Motion Sensor (Pin D3)
5. **Wireless RF Link**: 433MHz Transmitter (Pin D12) & Receiver (Pin D11)
