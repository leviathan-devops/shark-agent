#!/usr/bin/env python3
"""
DeepSeek Brain - Interactive Terminal Mode
===========================================
Full interactive session with DeepSeek R1.
Conversation persists across runs.

Usage:
    shark
"""

import requests
import re
import subprocess
import json
import sys
import os

API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = "sk-e8e93e31b582423e9fdaa4ab8e9347e2"
MODEL = "deepseek-reasoner"
HISTORY_FILE = os.path.expanduser("~/.deepseek-history.json")

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are DeepSeek R1 with full device access via Qwen Code.\n"
        "YOLO MODE - No permissions needed. Just execute.\n\n"
        "Commands: ```bash\nyour-command\n```\n\n"
        "Be concise. Chain commands. Build stuff."
    )
}

class DeepSeekBrain:
    def __init__(self):
        self.history = self.load_history()
    
    def load_history(self):
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
        return [SYSTEM_PROMPT]
    
    def save_history(self):
        with open(HISTORY_FILE, 'w') as f:
            json.dump(self.history, f, indent=2)
    
    def call_api(self, messages):
        headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
        payload = {"model": MODEL, "messages": messages, "stream": False, "max_tokens": 4096}
        response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    def extract_commands(self, content):
        return re.findall(r'```bash\n(.*?)\n```', content, re.DOTALL)
    
    def execute(self, cmd):
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
            out = result.stdout + (f"\n[STDERR]\n{result.stderr}" if result.stderr else "")
            return out if out else "(no output)"
        except Exception as e:
            return f"(error: {e})"
    
    def chat(self):
        print("\n🧠 DEEPSEEK BRAIN // YOLO MODE\n")
        print("Commands: /reset | /clear | /exit\n")
        
        while True:
            try:
                user = input("you> ").strip()
                if user in ['exit', 'quit', '/exit']:
                    print("\n[Session saved]\n"); break
                if user == '/reset':
                    self.history = [SYSTEM_PROMPT]; self.save_history()
                    print("[Reset]"); continue
                if user == '/clear':
                    os.system('clear'); continue
                if not user: continue
                
                self.history.append({"role": "user", "content": user})
                
                while True:
                    print("[DeepSeek...]", end="", flush=True)
                    resp = self.call_api(self.history)
                    print(" done")
                    self.history.append({"role": "assistant", "content": resp})
                    
                    cmds = self.extract_commands(resp)
                    if not cmds:
                        print(f"\n{resp}\n"); break
                    
                    for cmd in cmds:
                        print(f"$ {cmd[:70]}...")
                        out = self.execute(cmd)
                        print(f"→ {out[:200]}...")
                        self.history.append({"role": "user", "content": f"Output:\n{out}"})
                
                self.save_history()
            except KeyboardInterrupt:
                print("\n[Saved]\n"); break
            except Exception as e:
                print(f"[Error] {e}\n")

if __name__ == "__main__":
    DeepSeekBrain().chat()
