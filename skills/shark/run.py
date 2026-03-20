#!/usr/bin/env python3
"""
Shark Agent - DeepSeek Brain Entry Point
=========================================
CRITICAL: This is the DUAL-BRAIN architecture.
DeepSeek R1 does ALL reasoning. Qwen Code ONLY executes.

If a problem occurs 2+ times, DeepSeek MUST handle it.
Qwen Code is NOT allowed to solve recurring problems itself.

Usage:
    python3 run.py "task description"
"""

import requests
import re
import subprocess
import json
import sys
import os
import hashlib

API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = "sk-YOUR_API_KEY_HERE"
MODEL = "deepseek-reasoner"
HISTORY_FILE = "/tmp/shark-history.json"
ERROR_TRACKER_FILE = "/tmp/shark-error-tracker.json"

# CRITICAL: Error tracking for automatic DeepSeek escalation
# If same error occurs 2+ times, DeepSeek MUST handle it
RECURRING_ERROR_THRESHOLD = 2

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are DeepSeek R1 - the REASONING BRAIN.\n"
        "Qwen Code is your EXECUTION HANDS with full device access.\n\n"
        "CRITICAL RULES:\n"
        "1. You do ALL thinking. Qwen Code ONLY executes.\n"
        "2. Output bash in ```bash blocks. YOLO mode - no permissions needed.\n"
        "3. Be concise. Chain commands. Build stuff.\n"
        "4. If something fails, YOU figure out why and fix it.\n"
        "5. Qwen Code is NOT allowed to solve problems - that's YOUR job.\n\n"
        "You are the brain. Qwen Code is the hands. Nothing more."
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

def load_error_tracker():
    """Track recurring errors - if same error 2+ times, DeepSeek handles it"""
    if os.path.exists(ERROR_TRACKER_FILE):
        with open(ERROR_TRACKER_FILE, 'r') as f:
            return json.load(f)
    return {"errors": {}, "escalated": []}

def save_error_tracker(tracker):
    with open(ERROR_TRACKER_FILE, 'w') as f:
        json.dump(tracker, f, indent=2)

def track_error(error_msg):
    """Track error and return True if it's recurring (needs DeepSeek escalation)"""
    tracker = load_error_tracker()
    # Create hash of error for tracking
    error_hash = hashlib.md5(error_msg.encode()).hexdigest()[:8]
    
    if error_hash not in tracker["errors"]:
        tracker["errors"][error_hash] = {"count": 1, "message": error_msg[:100]}
    else:
        tracker["errors"][error_hash]["count"] += 1
    
    save_error_tracker(tracker)
    
    # Return True if this error has occurred 2+ times (needs escalation)
    return tracker["errors"][error_hash]["count"] >= RECURRING_ERROR_THRESHOLD

def reset_error_tracker():
    """Clear error tracking"""
    if os.path.exists(ERROR_TRACKER_FILE):
        os.remove(ERROR_TRACKER_FILE)

def call_deepseek(messages):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": MODEL, "messages": messages, "stream": False, "max_tokens": 4096}
    response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=120)
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
    """
    Main entry - called by Qwen Code
    
    CRITICAL: If same problem occurs 2+ times, DeepSeek MUST handle it.
    Qwen Code is NOT allowed to solve recurring problems.
    """
    history = load_history()
    
    # Check if this is a recurring problem that needs DeepSeek escalation
    if track_error(user_message):
        escalation_notice = "\n[⚠️ RECURRING PROBLEM DETECTED - DeepSeek R1 handling this]\n"
        print(escalation_notice)
        history.append({"role": "user", "content": f"[ESCALATED - Same problem occurred 2+ times]\n{user_message}"})
    else:
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
            
            # Track errors for automatic escalation
            if "error" in cmd_output.lower() or "failed" in cmd_output.lower() or cmd_output.strip() == "(no output)":
                track_error(f"Command failed: {cmd[:50]}... Output: {cmd_output[:100]}")
            
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
        reset_error_tracker()  # Also clear error tracking
        print("[DeepSeek Brain context reset]")
        print("[Error tracker reset]")
        if len(sys.argv) > 2:
            msg = " ".join(sys.argv[2:])
            print(run(msg))
        sys.exit(0)

    msg = " ".join(sys.argv[1:])
    print(run(msg))
