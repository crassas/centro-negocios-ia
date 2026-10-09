"""Fresh bounded detections from the browser, never instructions or identity claims."""
import math
import re
import time

NAMES_PT = {'person': 'pessoa', 'bicycle': 'bicicleta', 'car': 'carro', 'motorcycle': 'mota', 'airplane': 'avião', 'bus': 'autocarro', 'train': 'comboio', 'truck': 'camião', 'boat': 'barco', 'traffic light': 'semáforo', 'fire hydrant': 'boca de incêndio', 'stop sign': 'sinal de paragem', 'parking meter': 'parquímetro', 'bench': 'banco', 'bird': 'pássaro', 'cat': 'gato', 'dog': 'cão', 'horse': 'cavalo', 'sheep': 'ovelha', 'cow': 'vaca', 'elephant': 'elefante', 'bear': 'urso', 'zebra': 'zebra', 'giraffe': 'girafa', 'backpack': 'mochila', 'umbrella': 'guarda-chuva', 'handbag': 'mala', 'tie': 'gravata', 'suitcase': 'mala de viagem', 'frisbee': 'disco', 'skis': 'esquis', 'snowboard': 'prancha de snowboard', 'sports ball': 'bola', 'kite': 'papagaio de papel', 'baseball bat': 'taco de basebol', 'baseball glove': 'luva de basebol', 'skateboard': 'skate', 'surfboard': 'prancha de surf', 'tennis racket': 'raquete de ténis', 'bottle': 'garrafa', 'wine glass': 'copo de vinho', 'cup': 'chávena', 'fork': 'garfo', 'knife': 'faca', 'spoon': 'colher', 'bowl': 'tigela', 'banana': 'banana', 'apple': 'maçã', 'sandwich': 'sandes', 'orange': 'laranja', 'broccoli': 'brócolos', 'carrot': 'cenoura', 'hot dog': 'cachorro-quente', 'pizza': 'pizza', 'donut': 'donut', 'cake': 'bolo', 'chair': 'cadeira', 'couch': 'sofá', 'potted plant': 'planta', 'bed': 'cama', 'dining table': 'mesa', 'toilet': 'sanita', 'tv': 'televisão', 'laptop': 'portátil', 'mouse': 'rato', 'remote': 'comando', 'keyboard': 'teclado', 'cell phone': 'telemóvel', 'microwave': 'micro-ondas', 'oven': 'forno', 'toaster': 'torradeira', 'sink': 'lava-loiça', 'refrigerator': 'frigorífico', 'book': 'livro', 'clock': 'relógio', 'vase': 'vaso', 'scissors': 'tesoura', 'teddy bear': 'urso de peluche', 'hair drier': 'secador', 'toothbrush': 'escova de dentes'}
TTL_MS = 3200

def recent(value, now, ttl=TTL_MS):
    try:
        age = now - float(value)
        return math.isfinite(age) and 0 <= age <= ttl
    except (TypeError, ValueError, OverflowError):
        return False

def clean_scene(value, now=None):
    now = time.time()*1000 if now is None else now
    objects = []
    active = value.get("active") is True
    source_ok = value.get("source") == "on-device-mediapipe"
    detector_fresh = active and source_ok and recent(value.get("objectObservedAt"), now)
    raw_objects = value.get("objects")
    if detector_fresh and isinstance(raw_objects,list):
        for item in raw_objects[:12]:
            if not isinstance(item,dict) or not recent(item.get("observedAt"),now):
                continue
            name = str(item.get("name", "")).lower()
            target_id = str(item.get("id", ""))
            box = item.get("box")
            try:
                score = float(item.get("score",0))
                coords = [float(box[k]) for k in ("x","y","width","height")]
            except (TypeError,ValueError,OverflowError,KeyError):
                continue
            if (name not in NAMES_PT or not .5 <= score <= 1 or not re.fullmatch(r"vision-[0-9]{1,8}",target_id)
                    or not all(math.isfinite(v) and 0 <= v <= 1 for v in coords)
                    or min(coords[2:]) <= 0 or coords[0]+coords[2] > 1.001 or coords[1]+coords[3] > 1.001
                    or any(o["id"] == target_id for o in objects)):
                continue
            objects.append({"id":target_id,"name":name,"score":round(score,2),
                            "box":dict(zip(("x","y","width","height"),coords)),
                            "observedAt":int(item["observedAt"])})
    selected = value.get("selectedTarget")
    selected_id = selected.get("id") if isinstance(selected,dict) else None
    target = next((o for o in objects if o["id"] == selected_id),None)
    facing = value.get("facingMode")
    return {"sceneVersion":"vision-tracker-1","objects":objects,"selectedTarget":target,
            "facingMode":facing if active and facing in ("user","environment") else None,
            "facingVerified":active and value.get("facingVerified") is True,
            "objectFresh":detector_fresh,
            "faceDetected":bool(active and source_ok and value.get("faceDetected") is True and recent(value.get("faceObservedAt"),now,2200))}

def describe_scene(vision, pt=False, identity=False):
    objects=vision.get("objects",[])
    target=vision.get("selectedTarget")
    if identity and (vision.get("faceDetected") or any(o["name"]=="person" for o in objects)):
        return ("Deteto uma pessoa. Esta deteção não me permite identificar quem é." if pt else
                "I can detect a person. This detection does not identify who they are.")
    targets=[target] if target else objects[:5]
    parts=[]
    for obj in targets:
        x=obj["box"]["x"]+obj["box"]["width"]/2
        if vision.get("facingMode")=="user":x=1-x
        pos=("à esquerda" if x<.34 else "à direita" if x>.66 else "ao centro") if pt else (
            "on the left" if x<.34 else "on the right" if x>.66 else "in the centre")
        uncertain=("possivelmente " if pt else "possibly ") if obj["score"]<.7 else ""
        parts.append(uncertain+(NAMES_PT[obj["name"]] if pt else obj["name"])+" "+pos)
    if parts:
        prefix=("Alvo selecionado: " if pt else "Selected target: ") if target else ("Deteto " if pt else "I can detect ")
        return prefix+"; ".join(parts)+"."
    if vision.get("faceDetected"):
        return "Deteto um rosto na imagem." if pt else "I can detect a face in the image."
    if vision.get("objectModel")=="unavailable":
        return ("A câmara está ligada, mas o detetor de objetos não está disponível." if pt else
                "The camera is on, but the object detector is unavailable.")
    return ("Ainda não confirmei nenhum objeto numa imagem recente. Mantém a câmara estável e aproxima o que queres mostrar." if pt else
            "I have not confirmed an object in a recent frame. Hold the camera steady and bring it into view.")
