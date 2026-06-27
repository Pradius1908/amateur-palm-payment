#include <WiFi.h>
#include <HTTPClient.h>

// --- Configuration ---
const char* ssid = "SwiggitySwooty";
const char* password = "auha8942";
// IP address of the machine running main.py (e.g., "http://192.168.1.100:8000")
const String serverName = "http://YOUR_SERVER_IP:8000/process_latest_frame"; 

// --- Pin Definitions ---
const int trigPin = 13;
const int echoPin = 12;
const int redLedPin = 4;
const int greenLedPin = 5;
const int whiteLedPin = 22;
const int buzzerPin = 26;

// --- Distance Thresholds (in cm) ---
const int OUTER_RANGE = 30;
const int ACCEPTABLE_RANGE = 12;

long lastBlinkTime = 0;
bool ledState = false;

void setup() {
  Serial.begin(115200);
  
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  
  pinMode(redLedPin, OUTPUT);
  pinMode(greenLedPin, OUTPUT);
  pinMode(whiteLedPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);

  // Connect to Wi-Fi
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");
}

float getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  long duration = pulseIn(echoPin, HIGH);
  return duration * 0.034 / 2; // Convert to cm
}

void loop() {
  float distance = getDistance();
  
  // STATE 1: No palm detected (Outside outer range)
  if (distance > OUTER_RANGE) {
    if (millis() - lastBlinkTime > 500) { // Flash every 500ms
      ledState = !ledState;
      digitalWrite(redLedPin, ledState);
      digitalWrite(greenLedPin, !ledState); // Alternate flashing
      lastBlinkTime = millis();
    }
    digitalWrite(whiteLedPin, LOW);
  }
  
  // STATE 2: Palm in outer range (approaching)
  else if (distance > ACCEPTABLE_RANGE && distance <= OUTER_RANGE) {
    if (millis() - lastBlinkTime > 250) { // Fast blink Red
      ledState = !ledState;
      digitalWrite(redLedPin, ledState);
      lastBlinkTime = millis();
    }
    digitalWrite(greenLedPin, LOW);
    digitalWrite(whiteLedPin, LOW);
  }
  
  // STATE 3: Palm in acceptable range (Ready to scan)
  else if (distance > 0 && distance <= ACCEPTABLE_RANGE) {
    // 1. Turn on White LEDs, turn off others
    digitalWrite(whiteLedPin, HIGH);
    digitalWrite(redLedPin, LOW);
    digitalWrite(greenLedPin, LOW);
    
    Serial.println("Palm detected in range. Waiting 5 seconds...");
    tone(buzzerPin, 1000, 200); // Optional: Beep to let user know scanning started
    
    // 2. Wait exactly 5 seconds
    delay(5000);
    
    // 3. Trigger the backend to take the picture
    Serial.println("Taking picture and authenticating...");
    bool isSuccess = triggerPayment();
    
    // 4. Handle Authentication Result (takes up the remaining ~2 seconds)
    if (isSuccess) {
      Serial.println("Authentication Success!");
      // Blink green thrice
      for(int i = 0; i < 3; i++) {
        digitalWrite(greenLedPin, HIGH);
        tone(buzzerPin, 1500, 150); // Success beep
        delay(300);
        digitalWrite(greenLedPin, LOW);
        delay(300);
      }
      delay(200); // Pad to reach ~7 seconds total
    } else {
      Serial.println("Authentication Failed!");
      // Turn red on solid for failure
      digitalWrite(redLedPin, HIGH);
      tone(buzzerPin, 500, 1000); // Failure beep
      delay(2000);
      digitalWrite(redLedPin, LOW);
    }
    
    // 5. Turn off white LED after the 7 second sequence concludes
    digitalWrite(whiteLedPin, LOW);
    delay(1500); // Brief cooldown so it doesn't instantly re-trigger
  }
}

// --- Function to trigger the FastAPI Backend ---
bool triggerPayment() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverName);
    
    // Prepare the form data expected by process_latest_frame
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    String httpRequestData = "mode=pay&amount=50.0";
    
    int httpResponseCode = http.POST(httpRequestData);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println(response);
      http.end();
      
      // Check if the JSON response contains "success"
      if (response.indexOf("\"status\":\"success\"") != -1 || response.indexOf("\"status\": \"success\"") != -1) {
        return true; 
      }
    } else {
      Serial.print("Error code: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  }
  return false; // Failsafe
}
