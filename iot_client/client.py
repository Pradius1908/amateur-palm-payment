import cv2
import requests
import numpy as np
import io

# Config
SERVER_URL = "http://localhost:8000"

def capture_and_send(mode="pay", user_name=None):
    cap = cv2.VideoCapture(0)
    
    print(f"Starting {mode} mode. Press 's' to capture and send, 'q' to quit.")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame")
            break
            
        cv2.imshow("Palm Payment Client", frame)
        
        key = cv2.waitKey(1) & 0xFF
        if key == ord('s'):
            # Convert frame to bytes
            _, buffer = cv2.imencode(".jpg", frame)
            img_io = io.BytesIO(buffer)
            
            if mode == "register":
                files = {"image": ("register.jpg", img_io, "image/jpeg")}
                data = {"name": user_name}
                try:
                    response = requests.post(f"{SERVER_URL}/register", files=files, data=data)
                    print(response.json())
                except Exception as e:
                    print(f"Error: {e}")
            else:
                files = {"image": ("pay.jpg", img_io, "image/jpeg")}
                data = {"amount": 50.0}
                try:
                    response = requests.post(f"{SERVER_URL}/pay", files=files, data=data)
                    result = response.json()
                    
                    if result.get("status") == "success":
                        print(f"\n[SUCCESS] {result['message']}")
                    else:
                        print(f"\n[FAILED] {result.get('message', 'Unknown error')}")
                        
                except Exception as e:
                    print(f"Error: {e}")
            
            print("Action completed. Press 'q' to quit or 's' to try again.")
            
        elif key == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    choice = input("Enter 'r' to register or 'p' to pay: ").lower()
    if choice == 'r':
        name = input("Enter your name: ")
        capture_and_send(mode="register", user_name=name)
    else:
        capture_and_send(mode="pay")
