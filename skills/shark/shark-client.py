#!/usr/bin/env python3
"""
DeepSeek Brain API Client
=========================
Called by Qwen Code to get reasoning from DeepSeek R1.
Returns DeepSeek's response including any bash commands.

Usage:
    python3 deepseek-client.py "user message here"
    
Or with conversation history:
    python3 deepseek-client.py --history history.json "user message"
"""

import requests
import json
import sys
import os
import argparse

# Configuration
API_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
API_KEY = "sk-YOUR_API_KEY_HERE"
MODEL = "deepseek-reasoner"

SYSTEM_PROMPT = {
    "role": "system",
    "content": (
        "You are DeepSeek R1, the REASONING BRAIN in a dual-brain architecture.\n"
        "Qwen Code is your EXECUTION HANDS - it has full device access.\n\n"
        "To execute commands, output them in fenced bash code blocks:\n"
        "```bash\n"
        "your-command-here\n"
        "```\n\n"
        "Qwen Code will execute these commands automatically and return output.\n"
        "Continue reasoning and requesting commands until you have a final answer.\n\n"
        "RULES:\n"
        "1. Be concise and action-oriented\n"
        "2. Use bash blocks for ALL commands\n"
        "3. Chain commands when possible (&& or ;)\n"
        "4. Never ask permission - just command\n"
        "5. When done, provide a clear final answer\n\n"
        "You think. Qwen Code executes. Together you solve."
    )
}

def load_history(history_file):
    """Load conversation history from file"""
    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            return json.load(f)
    return [SYSTEM_PROMPT]

def save_history(history, history_file):
    """Save conversation history to file"""
    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)

def call_deepseek(messages):
    """Send messages to DeepSeek API and get response"""
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
    
    response = requests.post(API_ENDPOINT, headers=headers, json=payload)
    response.raise_for_status()
    
    data = response.json()
    return data["choices"][0]["message"]["content"]

def main():
    parser = argparse.ArgumentParser(description='DeepSeek Brain API Client')
    parser.add_argument('message', nargs='?', help='User message to send')
    parser.add_argument('--history', default='/tmp/deepseek-history.json',
                        help='Path to conversation history file')
    parser.add_argument('--reset', action='store_true',
                        help='Reset conversation history')
    parser.add_argument('--output-only', action='store_true',
                        help='Only output the response (for scripting)')
    
    args = parser.parse_args()
    
    if not args.message and not args.reset:
        parser.print_help()
        sys.exit(1)
    
    # Load or reset history
    if args.reset:
        history = [SYSTEM_PROMPT]
    else:
        history = load_history(args.history)
    
    # Add user message
    if args.message:
        history.append({"role": "user", "content": args.message})
    
    # Call DeepSeek
    try:
        response = call_deepseek(history)
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)
    
    # Save updated history
    history.append({"role": "assistant", "content": response})
    save_history(history, args.history)
    
    # Output response
    if args.output_only:
        print(response)
    else:
        print("=" * 60)
        print("DEEPSEEK R1 RESPONSE")
        print("=" * 60)
        print(response)
        print("=" * 60)

if __name__ == "__main__":
    main()
