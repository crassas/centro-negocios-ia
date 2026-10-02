#!/usr/bin/env python3
import gc
import time
import torch

POWER_MODE="MAX"

def gpu_info():
    if not torch.cuda.is_available():
        raise RuntimeError("GPU não activa. No Colab: Runtime > Change runtime type > GPU.")
    p=torch.cuda.get_device_properties(0)
    free,_=torch.cuda.mem_get_info()
    return {
        "name":p.name,
        "total_gb":round(p.total_memory/(1024**3),1),
        "free_gb":round(free/(1024**3),1),
        "compute_capability":".".join(map(str,torch.cuda.get_device_capability(0))),
    }

def profiles(vram):
    if vram>=30:
        return [
            ("Qwen/Qwen2.5-Coder-32B-Instruct-AWQ","Qwen2.5-Coder-32B-AWQ",16384,.94),
            ("Qwen/Qwen2.5-Coder-14B-Instruct-AWQ","Qwen2.5-Coder-14B-AWQ",16384,.92),
            ("Qwen/Qwen2.5-Coder-7B-Instruct-AWQ","Qwen2.5-Coder-7B-AWQ",16384,.90),
        ]
    if vram>=20:
        return [
            ("Qwen/Qwen2.5-Coder-14B-Instruct-AWQ","Qwen2.5-Coder-14B-AWQ",16384,.93),
            ("Qwen/Qwen2.5-Coder-7B-Instruct-AWQ","Qwen2.5-Coder-7B-AWQ",16384,.90),
        ]
    return [
        ("Qwen/Qwen2.5-Coder-14B-Instruct-AWQ","Qwen2.5-Coder-14B-AWQ",4096,.94),
        ("Qwen/Qwen2.5-Coder-7B-Instruct-AWQ","Qwen2.5-Coder-7B-AWQ",8192,.90),
    ]

class CentroGpuEngine:
    def __init__(self):
        self.info=gpu_info()
        self.model_id=self.label=self.tokenizer=self.llm=None
        self.max_model_len=0
        self._load()

    def _load(self):
        from transformers import AutoTokenizer
        from vllm import LLM
        errors=[]
        for model_id,label,max_len,util in profiles(self.info["total_gb"]):
            print("\nA tentar:",label,"· contexto",max_len)
            try:
                self.tokenizer=AutoTokenizer.from_pretrained(model_id,trust_remote_code=False)
                self.llm=LLM(
                    model=model_id,quantization="awq",dtype="half",
                    max_model_len=max_len,gpu_memory_utilization=util,
                    trust_remote_code=False,enforce_eager=True,
                )
                self.model_id,self.label,self.max_model_len=model_id,label,max_len
                print("✅ MODELO CARREGADO:",label)
                return
            except Exception as exc:
                errors.append(f"{label}: {exc}")
                print("⚠️ Falhou; a recuar.")
                self.llm=self.tokenizer=None
                gc.collect(); torch.cuda.empty_cache(); time.sleep(2)
        raise RuntimeError("\n".join(errors[-3:]))

    def chat(self,prompt,system="Responde em português de Portugal, sem gerúndio. Sê rigoroso e directo.",max_tokens=900,temperature=.2):
        from vllm import SamplingParams
        rendered=self.tokenizer.apply_chat_template(
            [{"role":"system","content":system},{"role":"user","content":prompt}],
            tokenize=False,add_generation_prompt=True
        )
        params=SamplingParams(
            temperature=max(float(temperature),.01),top_p=.9,
            max_tokens=int(max_tokens),repetition_penalty=1.05
        )
        t=time.time()
        out=self.llm.generate([rendered],params,use_tqdm=False)[0]
        text=out.outputs[0].text.strip()
        n=len(out.outputs[0].token_ids or [])
        dt=time.time()-t
        print(f"[{self.label} · {dt:.1f}s · {n} tokens · {n/dt if dt else 0:.1f} tok/s]")
        return text

def boot():
    info=gpu_info()
    print("=== CENTRO GPU NODE · COLAB ===")
    print("GPU:",info["name"],"· VRAM:",info["total_gb"],"GB · CC:",info["compute_capability"])
    return CentroGpuEngine()
