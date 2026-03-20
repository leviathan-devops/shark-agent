#!/bin/bash
# DeepSeek Brain - Shell Implementation
# Uses direct curl calls instead of broken Python wrappers

set -e

# Debug output
echo "DEBUG: Environment variable DEEPSEEK_API_KEY is set: ${DEEPSEEK_API_KEY:0:10}..." >&2

# Configuration
API_ENDPOINT="https://api.deepseek.com/v1/chat/completions"
MODEL="deepseek-reasoner"
HISTORY_FILE="/tmp/deepseek-qwen-history.json"
MAX_LOOPS=10
TIMEOUT=300

# Check API key (allow to be passed as first argument for testing)
if [[ -z "$DEEPSEEK_API_KEY" ]]; then
    echo "DEBUG: No env var found, checking command line arguments..." >&2
    if [[ -n "$1" && "$1" == *"sk-"* ]]; then
        echo "DEBUG: Using API key from command line" >&2
        DEEPSEEK_API_KEY="$1"
        shift
    else
        echo "Error: DEEPSEEK_API_KEY environment variable not set" >&2
        exit 1
    fi
else
    echo "DEBUG: Using API key from environment variable" >&2
fi

# System prompt
SYSTEM_PROMPT='{"role": "system", "content": "You are DeepSeek R1. Qwen Code executes your commands.\nOutput bash in ```bash blocks. YOLO mode - no permissions needed.\nBe concise. Chain commands. Build stuff."}'

# Load history
load_history() {
    if [[ -f "$HISTORY_FILE" ]]; then
        cat "$HISTORY_FILE"
    else
        echo "[$SYSTEM_PROMPT]"
    fi
}

# Save history
save_history() {
    echo "$1" > "$HISTORY_FILE"
}

# Call DeepSeek API
call_deepseek() {
    local messages="$1"
    
    curl -s -X POST "$API_ENDPOINT" \
        -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"$MODEL\", \"messages\": $messages, \"stream\": false, \"max_tokens\": 4096}" \
        --max-time $TIMEOUT
}

# Extract commands from response
extract_commands() {
    local content="$1"
    # Extract bash code blocks using awk
    echo "$content" | awk '/```bash/,/```/' | awk '!/```bash/ && !/```/ {print}' | sed '/^$/d'
}

# Execute command
execute() {
    local cmd="$1"
    echo "Executing: $cmd" >&2
    echo "DEBUG: Current directory: $(pwd)" >&2
    echo "DEBUG: Command being executed: $cmd" >&2
    local result
    result=$(timeout $TIMEOUT bash -c "$cmd" 2>&1)
    local exit_code=$?
    echo "DEBUG: Command exit code: $exit_code" >&2
    if [ $exit_code -ne 0 ]; then
        echo "(command timeout or error: $exit_code)" >&2
    fi
    echo "$result"
}

# Main function
main() {
    local user_message="$1"
    local reset="$2"
    
    # Reset history if requested
    if [[ "$reset" == "--reset" ]]; then
        rm -f "$HISTORY_FILE"
        echo "[DeepSeek Brain context reset]" >&2
        if [[ -n "$user_message" ]]; then
            main "$user_message"
        fi
        return 0
    fi
    
    # If the input looks like a direct command, execute it directly
    if [[ "$user_message" == *"="* || "$user_message" == *">"* || "$user_message" == *"<"* || "$user_message" == *"echo"* ]]; then
        echo "YOLO mode: Executing direct command" >&2
        execute "$user_message"
        return 0
    fi
    
    # Load history and add user message
    local history
    history=$(load_history)
    local new_history
    new_history=$(echo "$history" | jq --arg msg "$user_message" '. + [{"role": "user", "content": $msg}]')
    
    # Main loop
    for ((i=0; i<MAX_LOOPS; i++)) do
        # Call API
        local api_response
        api_response=$(call_deepseek "$new_history")
        
        # Check for errors
        if echo "$api_response" | jq -e '.error' >/dev/null 2>&1; then
            echo "API Error: $(echo "$api_response" | jq -r '.error.message')" >&2
            return 1
        fi
        
        # Extract content
        local content
        content=$(echo "$api_response" | jq -r '.choices[0].message.content // ""')
        local reasoning
        reasoning=$(echo "$api_response" | jq -r '.choices[0].message.reasoning_content // ""')
        
        # Combine reasoning and content
        local full_response="$reasoning"
        if [[ -n "$reasoning" && -n "$content" ]]; then
            full_response="$reasoning\n\n$content"
        elif [[ -n "$content" ]]; then
            full_response="$content"
        fi
        
        # Update history
        new_history=$(echo "$new_history" | jq --arg resp "$full_response" '. + [{"role": "assistant", "content": $resp}]')
        
        # Extract and execute commands
        local commands
        commands=$(extract_commands "$full_response")
        
        if [[ -z "$commands" ]]; then
            # No commands found, return response
            save_history "$new_history"
            echo "$full_response"
            return 0
        fi
        
        # Execute commands
        while IFS= read -r cmd; do
            if [[ -n "$cmd" ]]; then
                local cmd_output
                cmd_output=$(execute "$cmd")
                # Add output to history
                new_history=$(echo "$new_history" | jq --arg out "$cmd_output" '. + [{"role": "user", "content": "Output:\n'$out'"}]')
            fi
        done <<< "$commands"
    done
    
    # Save final history
    save_history "$new_history"
    echo "$full_response"
}

# Entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 \"message\""
        echo "       $0 --reset \"message\""
        exit 1
    fi
    
    main "$@"
fi