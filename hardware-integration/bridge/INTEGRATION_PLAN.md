# Hardware Integration Plan & Connection Blueprint

## Overview
This architectural document outlines how the isolated **hardware-integration** suite can be connected to the published **AIBot `/sensors` page** once approved, with **zero risk to existing chatbot, botanical AI, routes, dependencies, or UI**.

---

## Current Status & Isolation Verification
- **Existing AIBot Files Modified:** **0 (Zero)**
- **Existing Dependencies Modified:** **0 (Zero)**
- **Existing Routes Modified:** **0 (Zero)**
- **Working Tree Cleanliness:** Preserved. Existing code and production builds remain 100% untouched.

---

## Hardware Integration Architecture

```
[Field Node: Arduino + 5 Sensors]
  (DHT11/22, Soil A0, Ultrasonic D4/D5, PIR D3)
               │ (Wireless 433MHz RF or USB Serial)
               ▼
[Base Station: Arduino RF Receiver on USB Port]
               │ (115200 Baud JSON Packets)
               ▼
┌─────────────────────────────────────────────────────────────┐
│               hardware-integration/ Suite                   │
│                                                             │
│ 1. rf_serial_receiver.py (Scans USB, ignores Bluetooth)     │
│ 2. app.py (Isolated Flask REST API on Port 5050)            │
│ 3. hardware_sensors.db (Isolated SQLite database)           │
│ 4. dashboard/index.html (Zero-dependency Test Dashboard)    │
└──────────────────────────────┬──────────────────────────────┘
                               │
            (Optional Bridge - When User Approves)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Existing PlantDoctor AIBot                  │
│                                                             │
│ • Local Backend: http://localhost:5000/api/sensor-readings  │
│ • Hosted App:    https://veeresh4520.github.io/AIBot/sensors│
└─────────────────────────────────────────────────────────────┘
```

---

## 3 Safe Connection Options (Awaiting Your Explicit Approval)

### Option A: Zero-Code External Bridge (Recommended)
- **How it works:**
  Run `python hardware-integration/bridge/bridge_to_aibot.py`.
- **Impact on existing code:**
  **0 lines changed.** The bridge fetches from port 5050 and posts to port 5000 using standard REST API.
- **Production Safety:**
  100% safe. Can be stopped or started with Ctrl+C without touching any file in the Git repository.

### Option B: Point `/sensors` Page to Port 5050
- **How it works:**
  On the existing `/sensors` page, the user changes the **Local Service URL** input in the settings toolbar from `http://localhost:5000` to `http://localhost:5050` and clicks **Save & Reconnect**.
- **Impact on existing code:**
  **0 code files changed.** Stored entirely in browser `localStorage`.
- **Production Safety:**
  100% safe. Reversible instantly by typing `http://localhost:5000`.

### Option C: Direct Browser Web Serial Link
- **How it works:**
  Open `hardware-integration/dashboard/index.html` or the `/sensors` page in Google Chrome / Edge and click **Connect USB Hardware**.
- **Impact on existing code:**
  **0 code files changed.** Uses native Chromium Web Serial API.

---

## Verification Checklist
- [x] All hardware integration code is located in `hardware-integration/`.
- [x] No modifications to `package.json`, `package-lock.json`, `vite.config.ts`, or any root files.
- [x] No modifications to `src/pages/`, `src/components/`, `src/services/`, or `src/App.tsx`.
- [x] No commits pushed to remote repository.
- [x] Local test dashboard functions independently.
