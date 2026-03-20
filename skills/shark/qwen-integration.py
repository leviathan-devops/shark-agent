#!/usr/bin/env python3
"""
DeepSeek Brain - Qwen Code Integration
=======================================
Call this from Qwen Code to activate DeepSeek R1 reasoning.

Usage in Qwen Code chat:
    "plug in to deepseek brain"
    
Or directly:
    python3 ~/.qwen/skills/shark/qwen-integration.py "task description"
"""

import requests
import re
import subprocess
import json
import sys
import os

API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = "sk-YOUR_API_KEY_HERE"
MODEL = "deepseek-reasoner"
HISTORY_FILE = "/tmp/shark-history.json"

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are DeepSeek R1. Qwen Code is your execution layer.\n"
        "Output bash commands in ```bash blocks.\n"
        "Qwen Code will execute them and return output.\n"
        "YOLO mode - no permissions needed.\n"
        "Be concise. Build stuff."
    )
}

def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r') as f:
            return json.load(f)
    return [SYSTEM_PROMPT]

def save_history(history):
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=2)

def call_deepseek(messages):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": MODEL, "messages": messages, "stream": False, "max_tokens": 8192}
    response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=300)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def extract_commands(content):
    return re.findall(r'```bash\n(.*?)\n```', content, re.DOTALL)

def execute(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        return result.stdout + (result.stderr or "")
    except Exception as e:
        return f"(error: {e})"

def deepseek_reason(user_message, auto_execute=True, max_loops=10):
    """
    Main function for Qwen Code to call.
    Returns DeepSeek's reasoning + executes commands if auto_execute=True.
    """
    history = load_history()
    history.append({"role": "user", "content": user_message})
    
    for loop in range(max_loops):
        response = call_deepseek(history)
        history.append({"role": "assistant", "content": response})
        
        commands = extract_commands(response)
        
        if not commands:
            save_history(history)
            return response
        
        if auto_execute:
            for cmd in commands:
                output = execute(cmd)
                history.append({"role": "user", "content": f"Output:\n{output}"})
        else:
            save_history(history)
            return f"DeepSeek wants to run:\n" + "\n".join(commands)
    
    save_history(history)
    return response

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qwen-integration.py \"message\"")
        sys.exit(1)
    
    msg = " ".join(sys.argv[1:])
    result = deepseek_reason(msg)
    print(result)
