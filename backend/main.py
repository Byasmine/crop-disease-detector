from pathlib import Path
from typing import Any
import io
import threading
import logging
import yaml
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config" / "models.yaml"
MAX_FILE_SIZE = 10 * 1024 * 1024

app = FastAPI(title="SMART AGRI IA API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

with CONFIG_PATH.open("r", encoding="utf-8") as stream:
    MODEL_CONFIG: dict[str, Any] = yaml.safe_load(stream)
MODEL_CACHE: dict[str, Any] = {}


def _preload_models():
    logging.info("Preloading models in background...")
    for crop in list(MODEL_CONFIG.get("models", {}).keys()):
        try:
            if crop in MODEL_CACHE:
                continue
            load_model(crop)
            logging.info(f"Preloaded model for {crop}")
        except Exception as e:
            logging.exception(f"Failed to preload model {crop}: {e}")


@app.on_event("startup")
def startup_event():
    # Load models in a background thread to avoid blocking incoming requests
    t = threading.Thread(target=_preload_models, daemon=True)
    t.start()


def _load_classification_checkpoint(model_path: Path, config: dict[str, Any]):
    try:
        import torch
        from torchvision import models
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Installez torch et torchvision pour charger les modèles de classification.",
        ) from exc

    try:
        ckpt = torch.load(model_path, map_location="cpu", weights_only=False)
    except TypeError:
        ckpt = torch.load(model_path, map_location="cpu")

    if isinstance(ckpt, dict):
        state = ckpt.get("model_state_dict") or ckpt.get("state_dict") or ckpt
        num_classes = ckpt.get("num_classes")
        classes = ckpt.get("classes") or config.get("classes") or []
        hyper = ckpt.get("hyperparameters") or {}
        backbone = hyper.get("backbone") or config.get("backbone") or "efficientnet_b0"
    else:
        state = ckpt
        num_classes = None
        classes = config.get("classes") or []
        backbone = config.get("backbone") or "efficientnet_b0"

    if not num_classes:
        num_classes = config.get("num_classes") or (len(classes) if classes else None) or 1000

    builder = getattr(models, backbone, None)
    if builder is None:
        raise HTTPException(status_code=500, detail=f"Backbone inconnu: {backbone}")

    model_clf = builder(weights=None, num_classes=num_classes)
    model_clf.load_state_dict(state, strict=True)
    model_clf.eval()
    return {
        "type": "classification",
        "model": model_clf,
        "classes": list(classes) if classes else [],
        "num_classes": num_classes,
        "backbone": backbone,
    }


def load_model(crop: str):
    if crop in MODEL_CACHE:
        return MODEL_CACHE[crop]
    config = MODEL_CONFIG["models"].get(crop)
    if not config:
        raise HTTPException(status_code=400, detail=f"Culture inconnue: {crop}")
    model_path = BASE_DIR / config["path"]
    if not model_path.exists():
        raise HTTPException(status_code=503, detail=f"Modèle absent pour {crop}. Copiez le fichier dans {model_path}")

    model_type = (config.get("type") or "classification").lower()
    loaded = None

    if model_type == "ultralytics":
        try:
            from ultralytics import YOLO

            loaded = {"type": "ultralytics", "model": YOLO(str(model_path))}
        except Exception:
            # Not a YOLO checkpoint — fall through to classification
            loaded = None

    if loaded is None:
        try:
            loaded = _load_classification_checkpoint(model_path, config)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Impossible de charger le modèle: {exc}") from exc

    MODEL_CACHE[crop] = loaded
    return loaded


@app.get("/")
def root():
    return {
        "service": "SMART AGRI IA API",
        "version": "0.1.0",
        "endpoints": {"health": "/health", "analyze": "POST /analyze", "docs": "/docs"},
    }


@app.get("/health")
def health():
    models_info = {}
    for crop, item in MODEL_CONFIG.get("models", {}).items():
        file_exists = (BASE_DIR / item.get("path", "")).exists()
        loaded = False
        error = None
        info = MODEL_CACHE.get(crop)
        if info is None:
            loaded = False
        elif isinstance(info, dict) and info.get("model"):
            loaded = True
        else:
            loaded = False
            error = str(info)
        models_info[crop] = {"file": file_exists, "loaded": loaded, "error": error}
    return {"status": "ok", "models": models_info}


@app.post("/analyze")
async def analyze(crop: str = Form(...), image: UploadFile = File(...)):
    if crop not in MODEL_CONFIG["models"]:
        raise HTTPException(status_code=400, detail=f"Culture inconnue: {crop}")
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Format non supporté. Utilisez JPG, PNG ou WEBP.")
    payload = await image.read()
    if len(payload) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image trop volumineuse. Maximum: 10 MB.")
    try:
        pil_image = Image.open(io.BytesIO(payload)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Le fichier ne contient pas une image valide.") from exc

    model_info = load_model(crop)
    try:
        # Ultralytics YOLO detection model
        if isinstance(model_info, dict) and model_info.get("type") == "ultralytics":
            ymodel = model_info["model"]
            results = ymodel.predict(source=pil_image, verbose=False)
            result = results[0]
            names = result.names
            if getattr(result, "probs", None) is not None:
                class_id = int(result.probs.top1)
                confidence = float(result.probs.top1conf)
                class_name = names[class_id] if isinstance(names, dict) else names[class_id]
                return {"crop": crop, "prediction": class_name, "class_name": class_name, "confidence": confidence, "is_healthy": "healthy" in class_name.lower() or "sain" in class_name.lower(), "detections": []}
            boxes = []
            for box in result.boxes or []:
                class_id = int(box.cls[0])
                boxes.append({"class_name": names[class_id], "confidence": float(box.conf[0]), "xyxy": [round(float(value), 2) for value in box.xyxy[0].tolist()]})
            best = max(boxes, key=lambda item: item["confidence"], default={"class_name": "Aucune détection", "confidence": 0})
            return {"crop": crop, "prediction": best["class_name"], "class_name": best["class_name"], "confidence": best["confidence"], "is_healthy": "healthy" in best["class_name"].lower() or "sain" in best["class_name"].lower(), "detections": boxes}

        # PyTorch classification model fallback
        if isinstance(model_info, dict) and model_info.get("type") == "classification":
            clf = model_info["model"]
            classes = model_info.get("classes") or []
            try:
                import torch
                from torchvision import transforms as T
            except Exception as exc:
                raise HTTPException(status_code=500, detail="torch/torchvision requis pour l'inférence de classification.") from exc
            transform = T.Compose([T.Resize(256), T.CenterCrop(224), T.ToTensor(), T.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])])
            tensor = transform(pil_image).unsqueeze(0)
            with torch.no_grad():
                logits = clf(tensor)
                probs = torch.nn.functional.softmax(logits, dim=1)
                confidence, idx = torch.max(probs, dim=1)
                idx = int(idx.item())
                confidence = float(confidence.item())
                class_name = classes[idx] if idx < len(classes) else str(idx)
            return {"crop": crop, "prediction": class_name, "class_name": class_name, "confidence": confidence, "is_healthy": "healthy" in class_name.lower() or "sain" in class_name.lower(), "detections": []}

        # Unknown model info format
        raise HTTPException(status_code=500, detail="Modèle chargé dans un format non supporté par l'API.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur pendant l’inférence: {exc}") from exc
