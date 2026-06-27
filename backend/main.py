from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import uvicorn
import os
import pickle
import numpy as np
from typing import List

from database import SessionLocal, init_db, User, Transaction
from ml_pipeline import matcher

app = FastAPI()

# Global Trigger State for ESP32
payment_triggered = False

@app.get("/trigger")
def trigger_payment():
    global payment_triggered
    payment_triggered = True
    print("Debug: ESP32 Triggered a Payment scan.")
    return {"message": "Payment triggered successfully"}

@app.get("/check_trigger")
def check_trigger():
    global payment_triggered
    return {"triggered": payment_triggered}

@app.post("/clear_trigger")
def clear_trigger():
    global payment_triggered
    payment_triggered = False
    return {"message": "Trigger cleared"}

# Initialize DB
init_db()

# Ensure ShopOwner exists
def init_shop_owner():
    db = SessionLocal()
    shop_owner = db.query(User).filter(User.name == "ShopOwner").first()
    if not shop_owner:
        # ShopOwner doesn't need an embedding for this logic
        new_shop = User(name="ShopOwner", balance=0.0, embedding=b"")
        db.add(new_shop)
        db.commit()
    db.close()

init_shop_owner()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/register")
async def register_user(
    name: str = Form(...), 
    image: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    image_bytes = await image.read()
    palm_crop = matcher.detect_palm(image_bytes)
    if palm_crop is None:
        raise HTTPException(status_code=400, detail="No palm detected in image.")
    
    embedding = matcher.get_embedding(palm_crop)
    if embedding is None:
        raise HTTPException(status_code=500, detail="Could not extract features.")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.name == name).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already registered.")

    new_user = User(
        name=name,
        embedding=pickle.dumps(embedding),
        balance=100.0
    )
    db.add(new_user)
    db.commit()
    return {"message": f"User {name} registered successfully."}

@app.post("/pay")
async def process_payment(
    image: UploadFile = File(...), 
    amount: float = Form(50.0),
    db: Session = Depends(get_db)
):
    image_bytes = await image.read()
    palm_crop = matcher.detect_palm(image_bytes)
    if palm_crop is None:
        return {"status": "unsuccessful", "message": "No palm detected. Please position your hand correctly."}
    
    current_embedding = matcher.get_embedding(palm_crop)
    
    # Compare with all users in DB (excluding ShopOwner)
    all_users = db.query(User).filter(User.name != "ShopOwner").all()
    best_match_user = None
    highest_sim = -1.0
    
    for user in all_users:
        if not user.embedding: continue
        stored_embedding = pickle.loads(user.embedding)
        sim = matcher.cosine_similarity(current_embedding, stored_embedding)
        print(f"Debug: Comparing with {user.name}, Similarity: {sim:.4f}")
        if sim > highest_sim:
            highest_sim = sim
            best_match_user = user
            
    THRESHOLD = 0.85 # Adjusted for better recognition ease
    
    if best_match_user and highest_sim > THRESHOLD:
        if best_match_user.balance >= amount:
            # Debit Customer
            best_match_user.balance -= amount
            
            # Credit Shop Owner
            shop_owner = db.query(User).filter(User.name == "ShopOwner").first()
            shop_owner.balance += amount
            
            # Log Transaction
            new_tx = Transaction(user_id=best_match_user.id, amount=amount)
            db.add(new_tx)
            db.commit()
            
            return {
                "status": "success",
                "message": f"Payment of ${amount:.2f} successful. Thank you, {best_match_user.name}!",
                "customer": best_match_user.name,
                "remaining_balance": best_match_user.balance,
                "confidence": f"{highest_sim*100:.1f}%"
            }
        else:
            return {"status": "unsuccessful", "message": f"Insufficient balance. Current balance: ${best_match_user.balance:.2f}", "confidence": f"{highest_sim*100:.1f}%"}
    else:
        if highest_sim > 0.7:
             return {"status": "unsuccessful", "message": f"Similarity too low ({highest_sim*100:.1f}%). Please use your registered palm or re-register for better accuracy.", "confidence": f"{highest_sim*100:.1f}%"}
        return {"status": "unsuccessful", "message": "User not recognized. Please register first.", "confidence": f"{highest_sim*100:.1f}%" if highest_sim > 0 else "0%"}

@app.post("/verify")
async def verify_user(
    image: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    image_bytes = await image.read()
    palm_crop = matcher.detect_palm(image_bytes)
    if palm_crop is None:
        return {"status": "unsuccessful", "message": "No palm detected."}
    
    current_embedding = matcher.get_embedding(palm_crop)
    
    all_users = db.query(User).filter(User.name != "ShopOwner").all()
    best_match_user = None
    highest_sim = -1.0
    
    for user in all_users:
        if not user.embedding: continue
        stored_embedding = pickle.loads(user.embedding)
        sim = matcher.cosine_similarity(current_embedding, stored_embedding)
        print(f"Debug Verify: Comparing with {user.name}, Similarity: {sim:.4f}")
        if sim > highest_sim:
            highest_sim = sim
            best_match_user = user
            
    THRESHOLD = 0.85 
    
    if best_match_user and highest_sim > THRESHOLD:
        return {
            "status": "success",
            "message": f"User Verified: {best_match_user.name}",
            "user": best_match_user.name,
            "similarity": float(highest_sim),
            "confidence": f"{highest_sim*100:.1f}%"
        }
    else:
        if highest_sim > 0.7:
             return {"status": "unsuccessful", "message": f"Similarity too low ({highest_sim*100:.1f}%).", "confidence": f"{highest_sim*100:.1f}%"}
        return {
            "status": "unsuccessful", 
            "message": "User not recognized.",
            "highest_similarity": float(highest_sim) if highest_sim != -1.0 else 0.0,
            "confidence": f"{highest_sim*100:.1f}%" if highest_sim > 0 else "0%"
        }

@app.delete("/admin/clear_all_users")
def clear_all_users(db: Session = Depends(get_db)):
    db.query(Transaction).delete()
    # Delete all users except ShopOwner
    db.query(User).filter(User.name != "ShopOwner").delete()
    db.commit()
    return {"message": "All customer data cleared. Please re-register."}

@app.get("/api/server_info")
def get_server_info():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '127.0.0.1'
    finally:
        s.close()
    return {
        "local_ip": local_ip,
        "port": 8000,
        "mobile_url": f"http://{local_ip}:8000/mobile.html"
    }

@app.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": u.id, "name": u.name, "balance": u.balance} for u in users]

@app.put("/users/{user_id}/balance")
def update_balance(user_id: int, balance: float, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.balance = balance
    db.commit()
    return {"message": f"Balance for {user.name} updated to {balance}"}

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": f"User {user.name} deleted"}

@app.get("/transactions")
def list_transactions(db: Session = Depends(get_db)):
    txs = db.query(Transaction).order_by(Transaction.timestamp.desc()).limit(20).all()
    results = []
    for tx in txs:
        user = db.query(User).filter(User.id == tx.user_id).first()
        results.append({
            "id": tx.id,
            "user": user.name if user else "Unknown",
            "amount": tx.amount,
            "timestamp": tx.timestamp.isoformat()
        })
    return results

class ConnectionManager:
    def __init__(self):
        self.active_cameras: list[WebSocket] = []
        self.active_dashboards: list[WebSocket] = []
        self.latest_frame: bytes = None

    async def connect_camera(self, websocket: WebSocket):
        await websocket.accept()
        self.active_cameras.append(websocket)
        print(f"Debug: Camera connected. Total cameras: {len(self.active_cameras)}")

    def disconnect_camera(self, websocket: WebSocket):
        if websocket in self.active_cameras:
            self.active_cameras.remove(websocket)
            print(f"Debug: Camera disconnected. Total cameras: {len(self.active_cameras)}")

    async def connect_dashboard(self, websocket: WebSocket):
        await websocket.accept()
        self.active_dashboards.append(websocket)
        print(f"Debug: Dashboard connected. Total dashboards: {len(self.active_dashboards)}")

    def disconnect_dashboard(self, websocket: WebSocket):
        if websocket in self.active_dashboards:
            self.active_dashboards.remove(websocket)
            print(f"Debug: Dashboard disconnected. Total dashboards: {len(self.active_dashboards)}")

    async def broadcast_frame(self, frame: bytes):
        self.latest_frame = frame
        disconnected = []
        for connection in self.active_dashboards:
            try:
                await connection.send_bytes(frame)
            except Exception as e:
                print(f"Error broadcasting to dashboard: {e}")
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_dashboard(conn)

manager = ConnectionManager()

@app.websocket("/ws/camera")
async def websocket_camera(websocket: WebSocket):
    await manager.connect_camera(websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            await manager.broadcast_frame(data)
    except WebSocketDisconnect:
        manager.disconnect_camera(websocket)
    except Exception as e:
        print(f"Camera WS error: {e}")
        manager.disconnect_camera(websocket)

@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    await manager.connect_dashboard(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)
    except Exception as e:
        print(f"Dashboard WS error: {e}")
        manager.disconnect_dashboard(websocket)

@app.post("/process_latest_frame")
async def process_latest_frame(
    mode: str = Form(...),
    name: str = Form(None),
    amount: float = Form(50.0),
    db: Session = Depends(get_db)
):
    if not manager.latest_frame:
        return {"status": "unsuccessful", "message": "No live camera stream available. Connect your Android device first."}
    
    palm_crop = matcher.detect_palm(manager.latest_frame)
    if palm_crop is None:
        return {"status": "unsuccessful", "message": "No palm detected in the current live frame. Please align your hand."}
    
    current_embedding = matcher.get_embedding(palm_crop)
    if current_embedding is None:
        return {"status": "unsuccessful", "message": "Could not extract features from the palm."}

    if mode == "register":
        if not name or not name.strip():
            return {"status": "unsuccessful", "message": "Name is required for registration."}
        
        existing_user = db.query(User).filter(User.name == name).first()
        if existing_user:
            return {"status": "unsuccessful", "message": "User already registered."}

        new_user = User(
            name=name.strip(),
            embedding=pickle.dumps(current_embedding),
            balance=100.0
        )
        db.add(new_user)
        db.commit()
        return {"status": "success", "message": f"User '{name.strip()}' registered successfully."}
        
    elif mode == "pay":
        all_users = db.query(User).filter(User.name != "ShopOwner").all()
        best_match_user = None
        highest_sim = -1.0
        
        for user in all_users:
            if not user.embedding: continue
            stored_embedding = pickle.loads(user.embedding)
            sim = matcher.cosine_similarity(current_embedding, stored_embedding)
            print(f"Debug Pay WS: Comparing with {user.name}, Similarity: {sim:.4f}")
            if sim > highest_sim:
                highest_sim = sim
                best_match_user = user
                
        THRESHOLD = 0.85
        
        if best_match_user and highest_sim > THRESHOLD:
            if best_match_user.balance >= amount:
                best_match_user.balance -= amount
                shop_owner = db.query(User).filter(User.name == "ShopOwner").first()
                shop_owner.balance += amount
                
                new_tx = Transaction(user_id=best_match_user.id, amount=amount)
                db.add(new_tx)
                db.commit()
                
                return {
                    "status": "success",
                    "message": f"Payment of ${amount:.2f} successful.",
                    "customer": best_match_user.name,
                    "remaining_balance": best_match_user.balance,
                    "confidence": f"{highest_sim*100:.1f}%"
                }
            else:
                return {"status": "unsuccessful", "message": f"Insufficient balance. Current balance: ${best_match_user.balance:.2f}", "confidence": f"{highest_sim*100:.1f}%"}
        else:
            if highest_sim > 0.7:
                 return {"status": "unsuccessful", "message": f"Similarity too low ({highest_sim*100:.1f}%). Use registered palm.", "confidence": f"{highest_sim*100:.1f}%"}
            return {"status": "unsuccessful", "message": "User not recognized.", "confidence": f"{highest_sim*100:.1f}%" if highest_sim > 0 else "0%"}

    elif mode == "verify":
        all_users = db.query(User).filter(User.name != "ShopOwner").all()
        best_match_user = None
        highest_sim = -1.0
        
        for user in all_users:
            if not user.embedding: continue
            stored_embedding = pickle.loads(user.embedding)
            sim = matcher.cosine_similarity(current_embedding, stored_embedding)
            print(f"Debug Verify WS: Comparing with {user.name}, Similarity: {sim:.4f}")
            if sim > highest_sim:
                highest_sim = sim
                best_match_user = user
                
        THRESHOLD = 0.85
        
        if best_match_user and highest_sim > THRESHOLD:
            return {
                "status": "success",
                "message": f"User Verified: {best_match_user.name}",
                "user": best_match_user.name,
                "similarity": float(highest_sim),
                "confidence": f"{highest_sim*100:.1f}%"
            }
        else:
            if highest_sim > 0.7:
                 return {"status": "unsuccessful", "message": f"Similarity too low ({highest_sim*100:.1f}%).", "confidence": f"{highest_sim*100:.1f}%"}
            return {
                "status": "unsuccessful", 
                "message": "User not recognized.",
                "highest_similarity": float(highest_sim) if highest_sim != -1.0 else 0.0,
                "confidence": f"{highest_sim*100:.1f}%" if highest_sim > 0 else "0%"
            }

# Serve Frontend
backend_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.join(os.path.dirname(backend_dir), "frontend")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
