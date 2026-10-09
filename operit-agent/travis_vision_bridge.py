"""Ephemeral, on-request bridge for opt-in browser MediaPipe perception.

No video, photographs, face embeddings, identity or full-scene descriptions.
The browser reports only camera presence, face detection and known hand gestures.
"""
import math
import re
import time
import unicodedata

GESTURES={"None","Victory","Open_Palm","Closed_Fist","Thumb_Up"}
def normalised(text):
    s="".join(c for c in unicodedata.normalize("NFD",str(text).lower()) if not unicodedata.combining(c))
    return re.sub(r"\s+"," ",s).strip(" .,!?:;")
def visual_question(text):
    s=normalised(text)
    s=re.sub(r"^(?:(?:travis|jarvis|amigo|olha|please|hey)\s*[,;:!-]?\s*)+","",s)
    if re.search(r"\b(?:site|sites|website|websites|youtube|google|repositorio|repositorios|repositories|repository|repos|projects|projectos|projetos|project|tarefas|tasks)\b",s):
        return False
    patterns=(
        r"\b(?:consegues|podes|estas|esta|can you|could you|do you|are you)\b.{0,36}\b(?:ver|ver-me|see|seeing|watch|a ver|a olhar)\b.{0,20}(?:\b(?:me|a mim|my face|me now|meu rosto)\b)?",
        r"\b(?:ves|ve|ver|see|seeing|watching)\s*(?:-me|me|a mim|my face|my hand)\b",
        r"\b(?:o que|what)\s+(?:e que\s+)?(?:ves|estas a ver|consegues ver|can you see|do you see|are you seeing)\b",
        r"\b(?:what am i holding|o que tenho na mao|o que estou a segurar|quantos dedos|how many fingers|what do i look like)\b",
    )
    if any(re.search(p,s) for p in patterns):return True
    camera=re.search(r"\b(?:camara|camera|webcam|visao|vision|imagem|video|face|rosto|gesto|gestos|mao|maos|hands?)\b",s)
    return bool(camera and re.search(r"\b(?:detetas|detectas|detetar|detectar|detect|reconheces|recognise|recognize|acompanhas|acompanhar|estado|status|funciona|works|ligada|activo|ativa|o que|quais|can|podes|consegues|tens|see|ver)\b",s))
def observe(raw,clock=time.time):
    if (type(raw) is not dict or set(raw)-{"active","observedAt","frames","faceDetected","gesture"}
            or type(raw.get("active")) is not bool):return None
    at=raw.get("observedAt");now=clock()
    if type(at) not in (int,float) or not math.isfinite(at) or at>now+3 or now-at>7:return None
    if not raw["active"]:
        return {"source":"browser-mediapipe","active":False,"faceDetected":False,"frames":0,"gesture":"None"}
    frames=raw.get("frames",0);seen=raw.get("faceDetected",False);gesture=raw.get("gesture","None")
    if type(frames) is not int or frames<0 or frames>10000000:return None
    if type(seen) is not bool or type(gesture) is not str or gesture not in GESTURES:return None
    return {"source":"browser-mediapipe","active":True,"faceDetected":seen,"frames":frames,"gesture":gesture}
def reply(observation,language="pt"):
    pt=language=="pt"
    if observation is None:
        return ("Não recebi uma observação recente da câmara neste pedido. Tenho um detector local de rostos e gestos, mas não posso confirmar que esteja activo ou que te esteja a ver. Liga a câmara no Travis e pergunta novamente."
            if pt else "I received no recent browser camera observation. I have a local face and gesture detector, but cannot confirm the camera is active or that it sees you. Enable the camera in Travis and ask again.")
    if not observation["active"]:
        return ("A câmara está desligada. Quando a autorizares, consigo usar a detecção local de rostos e de alguns gestos."
            if pt else "The camera is off. Once you authorise it, I can use local face and gesture detection.")
    if observation["faceDetected"]:
        answer=("Sim. A câmara autorizada detectou um rosto há instantes. Consigo reagir à posição do rosto e a alguns gestos no navegador. Não identifico a pessoa, nem descrevo objectos ou a imagem inteira: ainda não está ligado um modelo visual de cenas."
            if pt else "Yes. The authorised camera detected a face moments ago. I can react to face position and some gestures in the browser. I cannot identify anyone or describe objects or the entire scene: no scene-vision model is connected yet.")
    elif observation["frames"]>0:
        answer=("A câmara está activa e o detector processou fotogramas, mas não tenho confirmação recente de um rosto. Consigo acompanhar alguns gestos, não interpretar a imagem completa."
            if pt else "The camera is active and the detector processed frames, but I have no recent confirmation of a face. I can track some gestures, not interpret the full image.")
    else:
        answer=("A câmara está ligada no navegador, mas ainda não recebi confirmação de um fotograma analisado. Aguarda um instante e tenta novamente."
            if pt else "The browser camera is on, but no analysed frame has been confirmed yet. Wait a moment and try again.")
    names={"Victory":("dois dedos em V","a V sign"),
           "Open_Palm":("mão aberta","an open palm"),
           "Closed_Fist":("punho fechado","a closed fist"),
           "Thumb_Up":("polegar para cima","a thumbs-up")}
    if observation["gesture"] in names:
        name=names[observation["gesture"]][0 if pt else 1]
        answer+=(" Gesto indicado pelo detector: "+name+"." if pt else " Reported hand gesture: "+name+".")
    return answer
def capability_note(observation,language="pt"):
    if observation is None:return ("Não recebi sinais da câmara neste pedido." if language=="pt" else "This request contained no camera observations.")
    if not observation["active"]:return ("Neste momento, a câmara está desligada." if language=="pt" else "The camera is currently off.")
    if observation["faceDetected"]:return ("A câmara confirmou agora a presença de um rosto através do detector local." if language=="pt" else "The local camera detector just confirmed the presence of a face.")
    return ("A câmara está activa, mas ainda não confirmou a presença de um rosto." if language=="pt" else "The camera is active but has not confirmed the presence of a face.")
