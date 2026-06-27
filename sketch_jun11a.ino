const int buzzerPin = 13; // Buzzer connected to digital pin 8

void setup() {
  pinMode(buzzerPin, OUTPUT); // Set the buzzer pin as an output
}

void loop() {
  // Play a 1000 Hz tone for 1 second
  tone(buzzerPin, 1000); 
  delay(1000);
  
  // Stop the tone for 1 second
  noTone(buzzerPin); 
  delay(1000);
  
  // Play a higher 1500 Hz tone for 1 second
  tone(buzzerPin, 1500
  ); 
  delay(1000);
  
  // Stop the tone for 1 second
  noTone(buzzerPin); 
  delay(1000);
}
