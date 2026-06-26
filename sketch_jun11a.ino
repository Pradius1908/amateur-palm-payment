#include <WiFi.h>
#include <HTTPClient.h>

// ============================
// Ultrasonic Sensor Pins
// ============================
#define TRIG_PIN 5
#define ECHO_PIN 18

// ============================
// White LED Pins
// ============================
#define LED1_PIN 23
#define LED2_PIN 22

// ============================
// Wi-Fi Credentials
// ============================
const char* ssid = "Smaran";
const char* password = "@smaran@";

// ============================
// Server URL
// Replace with your PC IP
// Example:
// http://192.168.1.10:8000/trigger
// ============================
const char* serverURL = "http://10.151.121.158:8000/trigger";

bool captureTriggered = false;

// ============================
// LED Control Functions
// ============================
void ledsOn() {
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, HIGH);
}

void ledsOff() {
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
}

// ============================
// Send Trigger to Server
// ============================
void sendTrigger() {
  WiFiClient client;
  HTTPClient http;

  Serial.println("Connecting to PalmPay Server...");

  if (http.begin(client, serverURL)) {

    int httpResponseCode = http.GET();

    if (httpResponseCode > 0) {
      Serial.print("Trigger Sent! Response Code: ");
      Serial.println(httpResponseCode);

      String response = http.getString();
      Serial.println("Server says: " + response);
    } else {
      Serial.print("Error on sending GET: ");
      Serial.println(httpResponseCode);
    }

    http.end();

  } else {
    Serial.println("Unable to connect to server");
  }
}

// ============================
// Setup
// ============================
void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);

  ledsOff();

  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// ============================
// Main Loop
// ============================
void loop() {

  // Generate ultrasonic pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  // Read echo duration
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    delay(100);
    return;
  }

  // Calculate distance in cm
  float distance = duration * 0.0343 / 2.0;

  // Trigger range: 7.5 cm to 25 cm
  if (distance >= 7.5 && distance <= 35 && !captureTriggered) {

    Serial.println(">> PALM DETECTED - TRIGGERING SCAN <<");

    ledsOn();          // Illuminate palm
    sendTrigger();     // Notify web application
    delay(1000);       // Keep LEDs on during capture
    ledsOff();

    captureTriggered = true;
  }

  // Reset trigger when hand is removed
  if (distance > 30.0) {
    captureTriggered = false;
  }

  delay(100);
}
