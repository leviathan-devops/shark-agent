#!/usr/bin/env python3
"""
Shark Agent - DeepSeek Brain Entry Point
=========================================
CRITICAL: This is the DUAL-BRAIN architecture.
DeepSeek R1 does ALL reasoning. Qwen Code ONLY executes.

HARDCODED TRIGGER PHRASES - Always use DeepSeek when detected:
- "think", "use the deepseek brain", "ask deepseek", "figure it out"
- "make it work", "wtf", "what the fuck", "why are you"
- "stupid", "dumb", "not working", "broken", "fix this"
- Any expression of frustration at Qwen's reasoning

These phrases mean: STOP trying to solve it yourself, use DeepSeek.
"""

import requests
import re
import subprocess
import json
import sys
import os
import hashlib

API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = "sk-e8e93e31b582423e9fdaa4ab8e9347e2"
MODEL_R1 = "deepseek-reasoner"      # Complex reasoning, coding, problem-solving
MODEL_CHAT = "deepseek-chat"        # Simple questions, facts, chat
HISTORY_FILE = "/tmp/shark-history.json"
ERROR_TRACKER_FILE = "/tmp/shark-error-tracker.json"

# CRITICAL: Error tracking for automatic DeepSeek escalation
# If same error occurs 2+ times, DeepSeek MUST handle it
RECURRING_ERROR_THRESHOLD = 2

# Query routing thresholds
SIMPLE_QUERY_MAX_LENGTH = 100  # Short queries likely simple

# HARDCODED TRIGGER PHRASES - Force DeepSeek usage
# These phrases mean user is frustrated with Qwen's reasoning
DEEPSEEK_TRIGGERS = [
    # Direct commands
    "think", "use the deepseek brain", "ask deepseek", "deepseek brain",
    "plug in to deepseek", "activate deepseek", "switch to deepseek",
    
    # Problem solving
    "figure it out", "make it work", "just fix it", "solve this",
    "get it working", "make this work",
    
    # Frustration expressions
    "wtf", "what the fuck", "what the hell", "why are you",
    "why isnt", "why is this", "this is stupid", "this is dumb",
    "stupid", "dumb", "not working", "broken", "fix this", "fix it",
    
    # Reasoning requests
    "think harder", "think about", "reason through", "analyze this",
    "deep reasoning", "smarter", "youre not thinking", "you're not thinking",
    
    # Repetition indicators
    "again", "still not", "already tried", "i already", "you keep",
    "same problem", "same issue", "still broken"
]

def check_deepseek_triggers(message):
    """Check if message contains trigger phrases that require DeepSeek"""
    message_lower = message.lower()
    for trigger in DEEPSEEK_TRIGGERS:
        if trigger in message_lower:
            return True, trigger
    return False, None

def route_query(message):
    """
    Route query to appropriate model:
    - deepseek-chat: Simple questions, facts, chat (fast, cheap)
    - deepseek-reasoner: Complex reasoning, coding, problem-solving (slow, expensive)
    
    Criteria for R1 (complex):
    - Contains trigger phrases (user frustrated)
    - Contains coding/technical keywords
    - Contains reasoning keywords
    - Long query (>100 chars)
    - Multiple sentences
    - Contains code blocks or file paths
    """
    msg_lower = message.lower()
    
    # Always use R1 for trigger phrases (user explicitly wants DeepSeek)
    triggered, _ = check_deepseek_triggers(message)
    if triggered:
        return MODEL_R1, "trigger"
    
    # Keywords indicating complex reasoning/coding
    complex_keywords = [
        # Coding
        "code", "program", "script", "function", "class", "debug", "error", "fix",
        "build", "compile", "run", "execute", "deploy", "install", "configure",
        "api", "database", "server", "file", "directory", "path", "import",
        # Reasoning
        "analyze", "reason", "solve", "calculate", "derive", "prove", "explain",
        "compare", "contrast", "evaluate", "optimize", "refactor", "design",
        "architecture", "algorithm", "complex", "how to", "why", "steps",
        # File operations
        "create", "write", "read", "delete", "move", "copy", "edit", "modify",
        # Problem indicators
        "broken", "not working", "crash", "fail", "issue", "problem", "bug"
    ]
    
    # Check for complex keywords
    for keyword in complex_keywords:
        if keyword in msg_lower:
            return MODEL_R1, f"keyword:{keyword}"
    
    # Check for code blocks or file paths
    if "```" in message or "/" in message or "." in message:
        return MODEL_R1, "code_detected"
    
    # Check length and sentence count
    sentences = [s.strip() for s in message.split('.') if s.strip()]
    if len(message) > SIMPLE_QUERY_MAX_LENGTH or len(sentences) > 1:
        return MODEL_R1, "complex_structure"
    
    # Default to Chat for simple questions
    return MODEL_CHAT, "simple"

def call_deepseek(messages, model=MODEL_R1):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "stream": False, "max_tokens": 8192}
    response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=300)
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"].get("content", "")
    reasoning = data["choices"][0]["message"].get("reasoning_content", "")
    # Combine reasoning + content for command extraction
    return reasoning + "\n" + content if reasoning else content

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
    
    AUTO-ROUTING: Queries are routed to appropriate model:
    - deepseek-chat: Simple questions (fast, cheap)
    - deepseek-reasoner: Complex reasoning/coding (slow, expensive)
    """
    history = load_history()
    
    # Auto-route query to appropriate model
    model, reason = route_query(user_message)
    
    # Check for hardcoded trigger phrases (frustration, reasoning requests)
    triggered, trigger_word = check_deepseek_triggers(user_message)
    if triggered:
        print(f"\n[🧠 DEEPSEEK TRIGGER: '{trigger_word}' - Using DeepSeek R1]\n")
        history.append({"role": "user", "content": f"[TRIGGERED: {trigger_word}]\n{user_message}"})
    # Check if this is a recurring problem that needs DeepSeek escalation
    elif track_error(user_message):
        print("\n[⚠️ RECURRING PROBLEM DETECTED - DeepSeek R1 handling this]\n")
        history.append({"role": "user", "content": f"[ESCALATED - Same problem occurred 2+ times]\n{user_message}"})
        model = MODEL_R1  # Force R1 for escalated issues
    else:
        history.append({"role": "user", "content": user_message})
    
    # Show routing decision for debugging
    if model == MODEL_CHAT:
        print(f"[📤 Using DeepSeek Chat (simple query)]")
    else:
        print(f"[🧠 Using DeepSeek R1 (complex: {reason})]")

    output = []

    for loop in range(max_loops):
        response = call_deepseek(history, model=model)
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
