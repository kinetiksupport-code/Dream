#!/usr/bin/env python3
"""Tokens del prompt de sistema con el tokenizador REAL de cada modelo.

    pip install tokenizers
    python3 scripts/ia/medir-tokens.py [--base <ref de git para comparar>]

Descarga (y guarda en ~/.cache/dream-tokenizers) tokenizer.json de Hugging Face:
- Qwen/Qwen3-32B: misma familia y vocabulario que qwen/qwen3.8-27b (Groq no
  publica el tokenizador de 3.8; la cifra exacta la da usage.prompt_tokens).
- openai/gpt-oss-20b: el de gpt-oss-20b y gpt-oss-120b (o200k_harmony).
No cuenta las plantillas de chat de cada proveedor (unos pocos tokens por mensaje).
"""
import json, os, subprocess, sys, urllib.request
from tokenizers import Tokenizer

MODELS = {"qwen3.8 (tokenizador Qwen3)": "Qwen/Qwen3-32B", "gpt-oss": "openai/gpt-oss-20b"}
CACHE = os.path.expanduser("~/.cache/dream-tokenizers")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def tokenizer(repo):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, repo.replace("/", "_") + ".json")
    if not os.path.exists(path):
        urllib.request.urlretrieve(f"https://huggingface.co/{repo}/resolve/main/tokenizer.json", path)
    return Tokenizer.from_file(path)

def parts(cwd):
    out = subprocess.run(["node", "scripts/ia/prompt-parts.mjs"], cwd=cwd, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)

def main():
    toks = {name: tokenizer(repo) for name, repo in MODELS.items()}
    data = parts(ROOT)
    count = lambda t, text: len(t.encode(text, add_special_tokens=False).ids)
    print("| Parte | " + " | ".join(toks) + " |")
    print("|---|" + "---:|" * len(toks))
    for section in ("parts", "totals"):
        for key, text in data[section].items():
            label = f"**{key}**" if section == "totals" else key
            print(f"| {label} | " + " | ".join(str(count(t, text)) for t in toks.values()) + " |")

if __name__ == "__main__":
    main()
