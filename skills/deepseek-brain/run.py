#!/usr/bin/env python3
"""
DeepSeek Brain - Main Entry Point
=================================
Called by Qwen Code when user says "plug in to deepseek brain"

Usage:
    python3 run.py "task description"
"""

import requests
import re
import subprocess
import json
import sys
import os

API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
MODEL = "deepseek-reasoner"
HISTORY_FILE = "/tmp/deepseek-qwen-history.json"

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are DeepSeek R1. Qwen Code executes your commands.\n"
        "Output bash in ```bash blocks. YOLO mode - no permissions needed.\n"
        "Be concise. Chain commands. Build stuff."
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
    if not API_KEY:
        raise ValueError("DEEPSEEK_API_KEY environment variable not set")
    
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": MODEL, "messages": messages, "stream": False, "max_tokens": 4096}
    response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=300)
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"].get("content", "")
    reasoning = data["choices"][0]["message"].get("reasoning_content", "")
    # Combine reasoning + content for command extraction
    return reasoning + "\n" + content if reasoning else content

def extract_commands(content):
    return re.findall(r'```bash\n(.*?)\n```', content, re.DOTALL)

def execute(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        return result.stdout + (result.stderr or "")
    except Exception as e:
        return f"(error: {e})"

def run(user_message, max_loops=10):
    """Main entry - called by Qwen Code"""
    history = load_history()
    history.append({"role": "user", "content": user_message})
    
    output = []
    
    for loop in range(max_loops):
        response = call_deepseek(history)
        history.append({"role": "assistant", "content": response})
        
        commands = extract_commands(response)
        
        if not commands:
            save_history(history)
            return response
        
        for cmd in commands:
            cmd_output = execute(cmd)
            history.append({"role": "user", "content": f"Output:\n{cmd_output}"})
    
    save_history(history)
    return response

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 run.py \"message\"")
        print("       python3 run.py --reset")
        sys.exit(1)
    
    if sys.argv[1] == "--reset":
        if os.path.exists(HISTORY_FILE):
            os.remove(HISTORY_FILE)
        print("[DeepSeek Brain context reset]")
        if len(sys.argv) > 2:
            msg = " ".join(sys.argv[2:])
            print(run(msg))
        sys.exit(0)
    
    msg = " ".join(sys.argv[1:])
    print(run(msg))
