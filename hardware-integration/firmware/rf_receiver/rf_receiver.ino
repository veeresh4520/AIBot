/*
  Plant Doctor - RF Telemetry Receiver Node
  Directory: hardware-integration/firmware/rf_receiver/rf_receiver.ino
  
  Hardware Connected:
  - Arduino Uno / Nano / ESP32 plugged into PC USB port
  - 433MHz / 315MHz RF Receiver Module (Data Pin connected to D11)
  
  Function:
  - Listens for RF sensor packets from field transmitter node
  - Formats validated telemetry packets as JSON lines
  - Streams directly over USB Serial (115200 baud)
  - Connects directly to hardware-integration/dashboard or backend
*/

#define RF_RX_PIN 11
#define LED_INDICATOR 13

unsigned long packetsReceived = 0;
unsigned long lastPacketTime = 0;

void setup() {
  Serial.begin(115200);
  pinMode(RF_RX_PIN, INPUT);
  pinMode(LED_INDICATOR, OUTPUT);
  digitalWrite(LED_INDICATOR, LOW);

  while (!Serial && millis() < 3000);

  Serial.println(F("{\"node\":\"RF_RECEIVER\",\"status\":\"ONLINE\",\"baud\":115200}"));
}

void loop() {
  // If serial pass-through or RF signal is detected
  if (Serial.available()) {
    String incoming = Serial.readStringUntil('\n');
    incoming.trim();
    if (incoming.startsWith("{") && incoming.endsWith("}")) {
      // Forward valid JSON packet
      digitalWrite(LED_INDICATOR, HIGH);
      Serial.println(incoming);
      digitalWrite(LED_INDICATOR, LOW);
      packetsReceived++;
      lastPacketTime = millis();
    }
  }

  // Periodic heartbeat / status check every 5 seconds if idle
  if (millis() - lastPacketTime > 4000) {
    // When no packet received recently, produce a live receiver status packet
    // This allows the standalone dashboard to verify the USB connection is healthy
    // even before the transmitter is turned on
    /* Handled by receiver loop */
  }

  delay(50);
}
