import cv2
import numpy as np
import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import io
import os
import urllib.request

class PalmMatcher:
    def __init__(self):
        # Path for the MediaPipe model
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        self.model_path = os.path.join(backend_dir, 'hand_landmarker.task')
        self._ensure_model_exists()
        
        # Initialize MediaPipe Hand Landmarker
        base_options = python.BaseOptions(model_asset_path=self.model_path)
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5
        )
        self.detector = vision.HandLandmarker.create_from_options(options)
        
        # Load ResNet50 for feature extraction
        resnet = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        self.feature_extractor = nn.Sequential(*list(resnet.children())[:-1])
        self.feature_extractor.eval()
        
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

    def _ensure_model_exists(self):
        if not os.path.exists(self.model_path):
            print("Downloading MediaPipe Hand Landmarker model...")
            url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
            urllib.request.urlretrieve(url, self.model_path)
            print("Download complete.")

    def detect_palm(self, image_bytes):
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: return None
        
        # Convert to RGB for MediaPipe
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        
        # Detect landmarks
        detection_result = self.detector.detect(mp_image)
        
        if detection_result.hand_landmarks:
            # Get landmarks for the first hand
            landmarks = detection_result.hand_landmarks[0]
            h, w, _ = img.shape
            
            # Key points for palm: Wrist and MCP joints
            points = []
            for idx in [0, 5, 9, 13, 17]:
                lm = landmarks[idx]
                points.append([int(lm.x * w), int(lm.y * h)])
            
            points = np.array(points)
            x, y, bw, bh = cv2.boundingRect(points)
            
            # Add padding
            pad = 30
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(w, x + bw + pad)
            y2 = min(h, y + bh + pad)
            
            palm_crop = img[y1:y2, x1:x2]
            
            if palm_crop.size > 0:
                # Enhancement: CLAHE
                lab = cv2.cvtColor(palm_crop, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
                cl = clahe.apply(l)
                limg = cv2.merge((cl,a,b))
                palm_crop = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
                
                # Sharpening
                gaussian = cv2.GaussianBlur(palm_crop, (0, 0), 2)
                palm_crop = cv2.addWeighted(palm_crop, 1.5, gaussian, -0.5, 0)
                
                return palm_crop
                
        return None

    def get_embedding(self, palm_img):
        if palm_img is None or palm_img.size == 0:
            return None
        
        palm_img_rgb = cv2.cvtColor(palm_img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(palm_img_rgb)
        
        input_tensor = self.transform(pil_img).unsqueeze(0)
        
        with torch.no_grad():
            embedding = self.feature_extractor(input_tensor)
        
        emb = embedding.flatten().numpy()
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
            
        return emb

    @staticmethod
    def cosine_similarity(feat1, feat2):
        if feat1 is None or feat2 is None:
            return 0.0
        return np.dot(feat1, feat2)

matcher = PalmMatcher()
