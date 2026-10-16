# Hardware Wiring Guide (5 Sensors + RF Node)

## 1. Field Transmitter Node (Battery or DC Powered)

### Sensor Pin Connections to Arduino (Uno / Nano / ESP32)
| Sensor | Sensor Pin | Arduino Pin | Notes |
|---|---|---|---|
| **DHT11 / DHT22** (Temp & Humidity) | Data (Signal) | **D2** | VCC to 5V, GND to GND. (Use 10kΩ pull-up between VCC & Data if bare sensor) |
| **PIR Motion Sensor** (HC-SR501) | Output (OUT) | **D3** | VCC to 5V, GND to GND. Adjust sensitivity pot on module |
| **Soil Moisture Sensor** | Analog Out (AOUT) | **A0** | VCC to 5V (or 3.3V for capacitive), GND to GND |
| **HC-SR04** (Water Level Ultrasonic) | Trig | **D4** | VCC to 5V, GND to GND |
| **HC-SR04** (Water Level Ultrasonic) | Echo | **D5** | Signal pin |
| **Water Level Analog Strip** (Alternative) | Signal | **A1** | Used if not using ultrasonic sensor |
| **433MHz RF Transmitter** (FS1000A) | DATA | **D12** | VCC to 5V, GND to GND, 17.3cm wire on ANT pin |

---

## 2. Base Station RF Receiver Node (Connected to PC via USB)

| Module | Module Pin | Arduino Pin | Notes |
|---|---|---|---|
| **433MHz RF Receiver** (XY-MK-5V) | DATA | **D11** | VCC to 5V, GND to GND, 17.3cm wire on ANT pin |
| **Onboard Status LED** | Anode | **D13** | Blinks upon valid telemetry packet reception |
| **USB Cable** | USB | **PC USB Port** | Baud rate: **115200** |

---

## 3. Important Tips for Reliable Hardware Telemetry
1. **USB Cable Type:** Always use a **USB Data Cable**, not a charge-only cable.
2. **Serial Monitor:** Make sure the Arduino IDE Serial Monitor is **CLOSED** when connecting via Web Serial or Python daemon (Windows only allows one program per COM port).
3. **Soil Calibration:** In air (dry), raw ADC is around 800–1000. In a cup of water (wet), raw ADC is around 300–450. You can tune `SOIL_DRY_ADC` and `SOIL_WET_ADC` in `rf_transmitter.ino`.
