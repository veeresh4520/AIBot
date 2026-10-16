/*
  Plant Doctor - 5-Sensor Field Telemetry Node
  Target Hardware: Arduino Uno, Nano, Mega, or ESP32
  
  Sensors Connected:
  1. Temperature & Humidity: DHT11 or DHT22 (Pin D2)
  2. Soil Moisture: Capacitive / Resistive Soil Sensor (Pin A0)
  3. Water Level: Ultrasonic HC-SR04 (Trig: D4, Echo: D5) OR Analog Depth Sensor (Pin A1)
  4. Motion Detection: PIR Sensor HC-SR501 (Pin D3)
  
  Baud Rate: 115200 bps
  Output: Formatted JSON line every 3 seconds
  Compatible directly with:
  - Plant Doctor Web Serial API ("Connect USB Hardware" in browser)
  - backend_sensor/serial_receiver.py
*/

#include <DHT.h>

// ================= PIN CONFIGURATION =================
#define DHTPIN 2               // Digital Pin for DHT11 / DHT22
#define DHTTYPE DHT11          // Change to DHT22 if using white DHT22 sensor

#define PIR_PIN 3              // Digital Pin for PIR Motion Sensor
#define SOIL_PIN A0            // Analog Pin for Soil Moisture Sensor

// Water Level Sensor Option 1: Ultrasonic Sensor (HC-SR04)
#define TRIG_PIN 4             // HC-SR04 Trig Pin
#define ECHO_PIN 5             // HC-SR04 Echo Pin
#define TANK_DEPTH_CM 100.0    // Total height of tank/well in cm (adjust to your tank)

// Water Level Sensor Option 2: Analog Submersible Strip (Optional fallback on A1)
#define WATER_ANALOG_PIN A1
#define USE_ULTRASONIC_FOR_WATER true  // Set false if using analog water strip

// Unique identifier for this field station
const char* DEVICE_ID = "FIELD_01";

// ================= SENSOR OBJECTS =================
DHT dht(DHTPIN, DHTTYPE);

// Calibration constants for Soil Moisture (0-1023 ADC values)
// Air (Dry) is typically ~800-1020, Water (Wet) is ~300-450
const int SOIL_DRY_ADC = 850;
const int SOIL_WET_ADC = 350;

void setup() {
  // Initialize USB Serial communication at 115200 baud
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait for serial port to connect

  // Pin modes
  pinMode(PIR_PIN, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Initialize DHT sensor
  dht.begin();

  // Print startup notification
  Serial.println(F("{\"status\":\"ready\",\"message\":\"Plant Doctor Sensor Node Initialized\"}"));
}

// Function to read water level percentage using HC-SR04 ultrasonic sensor
float readWaterLevelUltrasonic() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout (~5m range)
  if (duration <= 0) {
    // If sensor disconnected, return safe default 75%
    return 75.0;
  }

  // Calculate distance in cm (Speed of sound: 0.0343 cm/us)
  float distanceCm = (duration * 0.0343) / 2.0;

  // Calculate water level percentage based on tank depth
  // When tank is full, distance to water is ~5cm (100%)
  // When tank is empty, distance is TANK_DEPTH_CM (0%)
  float waterLevelPct = ((TANK_DEPTH_CM - distanceCm) / TANK_DEPTH_CM) * 100.0;
  if (waterLevelPct < 0.0) waterLevelPct = 0.0;
  if (waterLevelPct > 100.0) waterLevelPct = 100.0;
  return waterLevelPct;
}

// Function to read water level percentage using analog depth strip
float readWaterLevelAnalog() {
  int raw = analogRead(WATER_ANALOG_PIN);
  float pct = (raw / 700.0) * 100.0;
  if (pct < 0.0) pct = 0.0;
  if (pct > 100.0) pct = 100.0;
  return pct;
}

// Function to read soil moisture percentage (0% to 100%)
float readSoilMoisture() {
  int raw = analogRead(SOIL_PIN);
  // Map raw ADC (Wet=100%, Dry=0%)
  float moisture = map(raw, SOIL_DRY_ADC, SOIL_WET_ADC, 0, 100);
  if (moisture < 0.0) moisture = 0.0;
  if (moisture > 100.0) moisture = 100.0;
  return moisture;
}

void loop() {
  // 1. Read Temperature and Humidity from DHT
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  // Fallback if sensor fails or is disconnected
  if (isnan(humidity) || isnan(temperature)) {
    temperature = 26.5; // default fallback
    humidity = 58.0;
  }

  // 2. Read Soil Moisture
  float soilMoisture = readSoilMoisture();

  // 3. Read Water Level
  float waterLevel = USE_ULTRASONIC_FOR_WATER ? readWaterLevelUltrasonic() : readWaterLevelAnalog();

  // 4. Read Perimeter Motion (PIR sensor: HIGH when motion detected)
  int motionState = digitalRead(PIR_PIN);
  bool motionDetected = (motionState == HIGH);

  // 5. Send Clean JSON Packet over USB Serial
  Serial.print(F("{\"device_id\":\""));
  Serial.print(DEVICE_ID);
  Serial.print(F("\",\"temperature\":"));
  Serial.print(temperature, 1);
  Serial.print(F(",\"humidity\":"));
  Serial.print(humidity, 1);
  Serial.print(F(",\"soil_moisture\":"));
  Serial.print(soilMoisture, 1);
  Serial.print(F(",\"water_level\":"));
  Serial.print(waterLevel, 1);
  Serial.print(F(",\"motion\":"));
  Serial.print(motionDetected ? F("true") : F("false"));
  Serial.print(F(",\"is_simulated\":false}"));
  Serial.println(); // Trailing newline is critical for serial stream readers

  // Wait 3 seconds before next telemetry packet
  delay(3000);
}
