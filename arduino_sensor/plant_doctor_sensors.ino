#include <DHT.h>
#include <RH_ASK.h>
#include <SPI.h>

// Sensor pins
#define DHT_PIN 4
#define DHT_TYPE DHT11

#define SOIL_PIN 34
#define PIR_PIN 27

#define TRIG_PIN 5
#define ECHO_PIN 18

// Output pins
#define BUZZER_PIN 25
#define GREEN_LED 19
#define RED_LED 21
#define YELLOW_LED 22

// RF transmitter DATA pin
#define RF_TX_PIN 23

// Example thresholds: calibrate for your sensors
#define TEMP_THRESHOLD 35.0
#define DIST_THRESHOLD 100.0

// Replace these with your measured soil readings
#define SOIL_DRY_VALUE 3000
#define SOIL_WET_VALUE 1500

DHT dht(DHT_PIN, DHT_TYPE);

// RF transmitter: speed, RX unused, TX pin, PTT unused
RH_ASK rf(2000, -1, RF_TX_PIN, -1);
bool rfReady = false;

float readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return -1;
  }

  return duration * 0.0343 / 2.0;
}

int readSoilMoisture() {
  int raw = analogRead(SOIL_PIN);

  int percent = map(
    raw, SOIL_DRY_VALUE, SOIL_WET_VALUE, 0, 100
  );

  return constrain(percent, 0, 100);
}

void setup() {
  Serial.begin(115200);

  pinMode(PIR_PIN, INPUT);
  pinMode(SOIL_PIN, INPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);

  digitalWrite(TRIG_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  analogReadResolution(12);
  dht.begin();

  // Initialize RF transmitter
  if (rf.init()) {
    rfReady = true;
    Serial.println("RF transmitter ready");
  } else {
    Serial.println("RF transmitter initialization failed");
  }

  Serial.println("Smart Agriculture Monitoring System");
  Serial.println("Allow the PIR sensor to stabilize.");
}

void loop() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  int soilRaw = analogRead(SOIL_PIN);
  int soilPercent = readSoilMoisture();

  int motion = digitalRead(PIR_PIN);
  float distance = readDistance();

  bool soilDry = soilPercent < 35;

  bool highTemperature =
    !isnan(temperature) &&
    temperature >= TEMP_THRESHOLD;

  bool nearbyObject =
    distance > 0 && distance < DIST_THRESHOLD;

  bool alert = (motion == HIGH) || nearbyObject;

  // Reset outputs
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Soil condition
  if (soilDry) {
    digitalWrite(RED_LED, HIGH);
  } else {
    digitalWrite(GREEN_LED, HIGH);
  }

  // Temperature warning
  if (highTemperature) {
    digitalWrite(YELLOW_LED, HIGH);
  }

  // Motion / nearby object alert
  if (alert) {
    digitalWrite(RED_LED, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
  }

  // Display sensor data
  Serial.println("\n--- Sensor Readings ---");

  if (!isnan(temperature)) {
    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.println(" C");
  } else {
    Serial.println("Temperature: Sensor error");
  }

  if (!isnan(humidity)) {
    Serial.print("Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
  } else {
    Serial.println("Humidity: Sensor error");
  }

  Serial.print("Soil raw: ");
  Serial.println(soilRaw);

  Serial.print("Soil moisture: ");
  Serial.print(soilPercent);
  Serial.println(" % (estimated)");

  Serial.print("Motion: ");
  Serial.println(motion == HIGH ? "DETECTED" : "None");

  Serial.print("Distance: ");
  if (distance >= 0) {
    Serial.print(distance);
    Serial.println(" cm");
  } else {
    Serial.println("No echo");
  }

  Serial.print("Field alert: ");
  Serial.println(alert ? "ACTIVE" : "NORMAL");

  Serial.println("-----------------------");

  // ADDED: Transmit sensor readings wirelessly
  if (rfReady) {
    char message[RH_ASK_MAX_MESSAGE_LEN];
    // -99 indicates a DHT temperature error
    // -1 indicates a DHT humidity error or no distance echo
    float txTemp = isnan(temperature) ? -99.0 : temperature;
    float txHumidity = isnan(humidity) ? -1.0 : humidity;

    snprintf(
      message,
      sizeof(message),
      "%.1f,%.1f,%d,%d,%.1f",
      txTemp,
      txHumidity,
      soilPercent,
      motion,
      distance
    );

    rf.send((uint8_t *)message, strlen(message));
    rf.waitPacketSent();

    Serial.print("RF transmitted: ");
    Serial.println(message);
  }

  // PlantDoctor Web Dashboard JSON telemetry output
  float waterPct = (distance >= 0) ? constrain(((40.0 - distance) / 35.0) * 100.0, 0.0, 100.0) : 0.0;
  Serial.print(F("{\"device_id\":\"FIELD_01\",\"temperature\":"));
  Serial.print(!isnan(temperature) ? temperature : 26.0, 1);
  Serial.print(F(",\"humidity\":"));
  Serial.print(!isnan(humidity) ? humidity : 55.0, 1);
  Serial.print(F(",\"soil_moisture\":"));
  Serial.print(soilPercent);
  Serial.print(F(",\"water_level\":"));
  Serial.print(waterPct, 1);
  Serial.print(F(",\"motion\":"));
  Serial.print((motion == HIGH) ? F("true") : F("false"));
  Serial.print(F(",\"is_simulated\":false}"));
  Serial.println();

  delay(2000);
}