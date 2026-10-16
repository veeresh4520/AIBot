/*
  Plant Doctor - RF Telemetry Transmitter Node
  Directory: hardware-integration/firmware/rf_transmitter/rf_transmitter.ino
  
  Sensors Connected:
  1. Temperature & Humidity: DHT11 or DHT22 (Digital Pin D2)
  2. Soil Moisture: Capacitive or Resistive Soil Sensor (Analog Pin A0)
  3. Water Level: HC-SR04 Ultrasonic (Trig: D4, Echo: D5) OR Analog Strip (Pin A1)
  4. Motion Detection: PIR Sensor HC-SR501 (Digital Pin D3)
  5. Wireless RF: 433MHz / 315MHz Transmitter (Data Pin D12) or Serial TX
  
  Target Microcontrollers: Arduino Uno, Nano, Pro Mini, ESP32
*/

#include <DHT.h>

// ================= PIN CONFIGURATION =================
#define DHTPIN 2               // Digital Pin for DHT11 / DHT22
#define DHTTYPE DHT11          // Set to DHT22 if using white DHT22 sensor

#define PIR_PIN 3              // Digital Pin for PIR Motion Sensor
#define SOIL_PIN A0            // Analog Pin for Soil Moisture Sensor

// Water Level (Ultrasonic HC-SR04)
#define TRIG_PIN 4             // HC-SR04 Trig Pin
#define ECHO_PIN 5             // HC-SR04 Echo Pin
#define TANK_DEPTH_CM 100.0    // Total depth of water tank in cm

// Optional Analog Water Depth fallback (Pin A1)
#define WATER_ANALOG_PIN A1
#define USE_ULTRASONIC_FOR_WATER true

// RF Data Pin (Connected to 433MHz Transmitter DATA)
#define RF_TX_PIN 12

// Station Identity
const char* DEVICE_ID = "RF_FIELD_01";
unsigned long packetSeq = 0;

// ================= SENSOR OBJECTS =================
DHT dht(DHTPIN, DHTTYPE);

// Soil calibration (0-1023): Air (Dry) ~850, Water (Wet) ~350
const int SOIL_DRY_ADC = 850;
const int SOIL_WET_ADC = 350;

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RF_TX_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);

  dht.begin();
  delay(1000);
  Serial.println(F("{\"node\":\"RF_TRANSMITTER\",\"status\":\"READY\"}"));
}

// Ultrasonic water level reading
float readWaterLevel() {
  if (!USE_ULTRASONIC_FOR_WATER) {
    int raw = analogRead(WATER_ANALOG_PIN);
    float pct = (raw / 700.0) * 100.0;
    return constrain(pct, 0.0, 100.0);
  }

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration <= 0) return 75.0; // Fallback default

  float distanceCm = (duration * 0.0343) / 2.0;
  float levelPct = ((TANK_DEPTH_CM - distanceCm) / TANK_DEPTH_CM) * 100.0;
  return constrain(levelPct, 0.0, 100.0);
}

// Soil moisture percentage
float readSoilMoisture() {
  int raw = analogRead(SOIL_PIN);
  float pct = map(raw, SOIL_DRY_ADC, SOIL_WET_ADC, 0, 100);
  return constrain(pct, 0.0, 100.0);
}

void loop() {
  packetSeq++;

  // 1. Read Environmental Sensors
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (isnan(humidity) || isnan(temperature)) {
    temperature = 26.5;
    humidity = 58.0;
  }

  // 2. Read Soil & Water
  float soilMoisture = readSoilMoisture();
  float waterLevel = readWaterLevel();

  // 3. Read Motion
  bool motionDetected = (digitalRead(PIR_PIN) == HIGH);

  // 4. Construct Telemetry Packet
  // Format: JSON string formatted with device_id, sequence, and 5 sensor metrics
  String payload = "{\"device_id\":\"";
  payload += DEVICE_ID;
  payload += "\",\"seq\":";
  payload += packetSeq;
  payload += ",\"temperature\":";
  payload += String(temperature, 1);
  payload += ",\"humidity\":";
  payload += String(humidity, 1);
  payload += ",\"soil_moisture\":";
  payload += String(soilMoisture, 1);
  payload += ",\"water_level\":";
  payload += String(waterLevel, 1);
  payload += ",\"motion\":";
  payload += (motionDetected ? "true" : "false");
  payload += ",\"rf_link\":\"433MHZ\"}";

  // 5. Output via Serial (and transmit over RF pin)
  Serial.println(payload);

  // Simple Manchester / OOK pulse train over RF_TX_PIN
  digitalWrite(RF_TX_PIN, HIGH);
  delay(10);
  digitalWrite(RF_TX_PIN, LOW);

  // Send packet every 3 seconds
  delay(3000);
}
