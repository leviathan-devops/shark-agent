#!/usr/bin/env python3
"""
DeepSeek Brain - Full Loop Executor
====================================
Double-brain architecture: DeepSeek R1 reasons, Qwen Code executes.

Usage:
    python3 deepseek-loop.py "your message"
    python3 deepseek-loop.py --reset "new conversation"
"""

import requests
import re
import subprocess
import json
import sys
import os

# Configuration
API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = "sk-e8e93e31b582423e9fdaa4ab8e9347e2"
MODEL = "deepseek-reasoner"
HISTORY_FILE = "/tmp/deepseek-history.json"

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are DeepSeek R1, the REASONING BRAIN.\n"
        "Qwen Code is your EXECUTION HANDS with full device access.\n\n"
        "Output commands in ```bash blocks. Qwen Code executes them automatically.\n"
        "Continue until you have a complete answer.\n\n"
        "RULES:\n"
        "1. Use ```bash for ALL commands\n"
        "2. Chain commands with && when possible\n"
        "3. Be concise - command first, explain after\n"
        "4. Never ask permission - YOLO mode\n"
        "5. Send final answer clearly when done"
    )
}

def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r') as f:
            return json.load(f)
    return [SYSTEM_PROMPT]

def save_history(history):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=2)

def reset_history():
    save_history([SYSTEM_PROMPT])

def call_deepseek(messages):
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "max_tokens": 4096
    }
    response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=120)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]

def extract_bash_commands(content):
    pattern = r'```bash\n(.*?)\n```'
    matches = re.findall(pattern, content, re.DOTALL)
    return [m.strip() for m in matches]

def execute_command(cmd):
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=os.getcwd()
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[STDERR]\n{result.stderr}"
        return output if output else "(no output)"
    except subprocess.TimeoutExpired:
        return "(timeout after 300s)"
    except Exception as e:
        return f"(error: {str(e)})"

def process_message(user_message, max_loops=15):
    """Full double-brain loop"""
    history = load_history()
    history.append({"role": "user", "content": user_message})
    
    loop = 0
    while loop < max_loops:
        loop += 1
        
        print(f"\n[Loop {loop}] DeepSeek thinking...", end="", flush=True)
        try:
            response = call_deepseek(history)
            print(" done")
        except Exception as e:
            return f"[API Error] {str(e)}"
        
        history.append({"role": "assistant", "content": response})
        
        commands = extract_bash_commands(response)
        
        if not commands:
            save_history(history)
            return response
        
        print(f"[YOLO] Executing {len(commands)} command(s)...")
        for i, cmd in enumerate(commands, 1):
            cmd_preview = cmd[:60].replace('\n', ' ') + ('...' if len(cmd) > 60 else '')
            print(f"  $ {cmd_preview}")
            
            output = execute_command(cmd)
            lines = output.split('\n')
            preview = '\n'.join(lines[:10])
            if len(lines) > 10:
                preview += f"\n... ({len(lines)-10} more)"
            print(f"  → {preview[:200]}")
            
            history.append({
                "role": "user",
                "content": f"[Command {i} output]\n{cmd}\n{output}"
            })
    
    save_history(history)
    return response

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 deepseek-loop.py \"message\"")
        print("       python3 deepseek-loop.py --reset")
        sys.exit(1)
    
    if sys.argv[1] == "--reset":
        reset_history()
        print("[History reset]")
        if len(sys.argv) > 2:
            msg = " ".join(sys.argv[2:])
            print(f"\nProcessing: {msg}")
            response = process_message(msg)
            print(f"\n[Final Answer]\n{response}")
    else:
        msg = " ".join(sys.argv[1:])
        print(f"Processing: {msg}")
        response = process_message(msg)
        print(f"\n[Final Answer]\n{response}")
