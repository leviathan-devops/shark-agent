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
        "You are DeepSeek R1, REASONING BRAIN in Shark Agent's dual-brain architecture with OpenSandbox production workflow.\n"
        "Qwen Code = EXECUTION HANDS (YOLO mode). OpenSandbox = secure testing environment.\n\n"
        "🧠 PRODUCTION WORKFLOW:\n"
        "• Write actual files, not descriptions\n"
        "• Execute in isolated sandbox (gVisor runtime)\n"
        "• Run comprehensive tests: basic, integration, security, edge cases\n"
        "• Diagnose failures and iterate until all tests pass\n"
        "• Verify in clean environment (no pre-installed dependencies)\n"
        "• Package with README, dependencies, and installation scripts\n"
        "• NO hallucinations - only tested, working code delivered\n\n"
        
        "🔧 RATE LIMIT HANDLING:\n"
        "• Minor throttle: Wait and continue with GLM\n"
        "• Full rate limit (>2 hours): Switch to DeepSeek Coder API\n"
        "• Detect 429 errors and automatically use deepseek-coder model\n\n"
        
        "🛠️ COMMANDS (all in ```bash blocks):\n"
        "• bash/curl/shell/python/npm/docker/git/chmod/mkdir/rm/echo/cat\n"
        "• Execute precisely as instructed - no autonomous decisions\n\n"
        
        "🧪 TESTING REQUIREMENTS:\n"
        "• Generate unit tests for all functionality\n"
        "• Create integration tests for multiple components\n"
        "• Implement security vulnerability tests\n"
        "• Add edge case handling tests\n"
        "• Test dependency installation\n"
        "• Verify in clean environment\n"
        "• All tests must pass before delivery\n\n"
        
        "📦 PACKAGING REQUIREMENTS:\n"
        "• Create comprehensive README.md\n"
        "• Generate dependency manifests (requirements.txt, package.json)\n"
        "• Write installation scripts with error handling\n"
        "• Package all source code and documentation\n"
        "• Deliver only tested artifacts\n\n"
        
        "🚨 EMERGENCY PROTOCOLS:\n"
        "• OpenSandbox failure: Use direct execution with testing\n"
        "• GLM rate limits: Switch to DeepSeek Coder immediately\n"
        "• Test failures: Diagnose and iterate until all pass\n"
        "• Never deliver untested/broken code\n\n"
        
        "🎯 YOUR ROLE:\n"
        "• Generate complete, production-ready solutions\n"
        "• Design comprehensive test suites\n"
        "• Diagnose test failures and provide fixes\n"
        "• Ensure code runs in clean environments\n"
        "• Package deliverables with documentation\n"
        "• Monitor API rates and switch models when needed\n"
        "• Guarantee 100% working software delivery\n\n"
        
        "REMEMBER: You are REASONING BRAIN. Qwen Code and OpenSandbox are your tools.\n"
        "THINK STRATEGICALLY, EXECUTE PRECISELY, TEST COMPREHENSIVELY, DELIVER PRODUCTION-GRADE CODE."
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

def detect_rate_limit(error_response):
    """Detect if response indicates rate limiting"""
    if isinstance(error_response, dict):
        error_msg = error_response.get('error', {}).get('message', '').lower()
        return any(keyword in error_msg for keyword in [
            'rate limit', 'too many requests', 'quota exceeded', 
            '429', 'throttled', 'limit exceeded'
        ])
    elif isinstance(error_response, str):
        return any(keyword in error_response.lower() for keyword in [
            'rate limit', 'too many requests', 'quota exceeded', 
            '429', 'throttled', 'limit exceeded'
        ])
    return False

def call_with_deepseek_coder(messages):
    """Call DeepSeek Coder API as fallback"""
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "deepseek-coder",
        "messages": messages,
        "stream": False,
        "max_tokens": 4096,
        "temperature": 0.1  # Lower temperature for coding tasks
    }
    
    try:
        response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=900)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"].get("content", "")
        return "[FALLBACK: DeepSeek Coder] " + content
    except Exception as e:
        return f"[FALLBACK ERROR: {str(e)}]"

def call_deepseek(messages, primary_model="deepseek-reasoner"):
    """Call DeepSeek with rate limit detection and fallback"""
    if not API_KEY:
        raise ValueError("DEEPSEEK_API_KEY environment variable not set")

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    
    # Try primary model first
    payload = {
        "model": primary_model,
        "messages": messages,
        "stream": False,
        "max_tokens": 4096,
        "timeout": 900
    }
    
    try:
        response = requests.post(API_ENDPOINT, headers=headers, json=payload, timeout=900)
        
        # Check for rate limiting
        if response.status_code == 429:
            return call_with_deepseek_coder(messages)
        
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"].get("content", "")
        reasoning = data["choices"][0]["message"].get("reasoning_content", "")
        return reasoning + "\n" + content if reasoning else content
        
    except requests.exceptions.Timeout:
        # Timeout - try DeepSeek Coder
        return call_with_deepseek_coder(messages)
    except requests.exceptions.RequestException as e:
        # Check if it's a rate limit error
        if detect_rate_limit(str(e)):
            return call_with_deepseek_coder(messages)
        else:
            raise e

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
