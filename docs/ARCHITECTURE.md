# Architecture

DeepSeek Brain Skill implements a **double-brain architecture** for AI-powered task execution.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOUBLE-BRAIN ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐         ┌──────────────┐         ┌──────────┐ │
│  │    USER     │ ──────→ │  QWEN CODE   │ ──────→ │ DEEPSEEK │ │
│  │  (input)    │         │  (executor)  │         │   R1     │ │
│  └─────────────┘         └──────────────┘         └──────────┘ │
│         │                      │                      │         │
│         │                      │                      │         │
│         │                      ↓                      │         │
│         │              ┌──────────────┐               │         │
│         │              │  BASH CMD    │               │         │
│         │              │  EXECUTION   │               │         │
│         │              └──────────────┘               │         │
│         │                      │                      │         │
│         │                      ↓                      │         │
│         │              ┌──────────────┐               │         │
│         │              │    OUTPUT    │ ──────────────┘         │
│         │              │   (result)   │                         │
│         │              └──────────────┘                         │
│         ↓                                                        │
│  ┌─────────────┐                                                │
│  │   FINAL     │                                                │
│  │   ANSWER    │                                                │
│  └─────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. DeepSeek R1 (The Brain)

**Role:** Reasoning, planning, complex problem-solving

**Capabilities:**
- Advanced reasoning (better than most coding models)
- Complex task decomposition
- Multi-step planning
- Code analysis and architecture

**Limitations:**
- No direct device access
- Cannot execute commands
- Cannot read/write files

**API:**
- Endpoint: `https://api.deepseek.com/v1/chat/completions`
- Model: `deepseek-reasoner`
- Authentication: Bearer token

### 2. Qwen Code (The Hands)

**Role:** Execution, device access, command execution

**Capabilities:**
- Full filesystem access
- Command execution (bash)
- Network operations
- Process management

**Limitations:**
- Less sophisticated reasoning
- May miss complex patterns
- Limited strategic planning

### 3. Bridge Layer (run.py)

**Role:** Connect brain to hands

**Responsibilities:**
1. Receive user input
2. Send to DeepSeek API
3. Parse response for bash commands
4. Execute commands locally
5. Return output to DeepSeek
6. Loop until task complete

**Key Features:**
- Command extraction via regex
- Auto-execute mode (YOLO)
- Conversation history management
- Error handling and retries

## Data Flow

### Single Turn

```
User Input
    ↓
┌─────────────────────────────────┐
│ 1. Load conversation history    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 2. Append user message          │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 3. Call DeepSeek API            │
│    POST /v1/chat/completions    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 4. Parse response               │
│    - Extract content            │
│    - Extract reasoning_content  │
│    - Find ```bash blocks        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 5. Commands found?              │───→ No ───→ Return final answer
│    Yes                          │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 6. Execute each command         │
│    subprocess.run(cmd)          │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 7. Send output to DeepSeek      │
│    (as new user message)        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ 8. Loop to step 3               │
└─────────────────────────────────┘
```

### Multi-Turn (Loop)

```
Loop iteration 1:
  User: "Create a Flask app"
  DeepSeek: [reasoning] + ```bash mkdir app && ...```
  Execute: mkdir app, cat > app.py, pip install flask
  Output: (no output)

Loop iteration 2:
  DeepSeek sees: Output from commands
  DeepSeek: [reasoning] + "Flask app created. Run with: python app.py"
  No commands → Final answer returned
```

## Command Extraction

Regex pattern for extracting bash commands:

```python
pattern = r'```bash\n(.*?)\n```'
matches = re.findall(pattern, content, re.DOTALL)
```

This matches:
- Opening: ```bash\n
- Content: (.*?) - non-greedy match
- Closing: \n```

## Conversation History

History is stored as JSON:

```json
[
  {
    "role": "system",
    "content": "You are DeepSeek R1..."
  },
  {
    "role": "user",
    "content": "Create a Flask app"
  },
  {
    "role": "assistant",
    "content": "```bash\nmkdir app\n```"
  },
  {
    "role": "user",
    "content": "Output:\n(no output)"
  }
]
```

**Location:** `/tmp/deepseek-qwen-history.json`

**Persistence:** History persists across sessions until:
- User runs `deepseek --reset`
- File is manually deleted
- System temp cleanup

## Error Handling

### API Errors
```python
try:
    response = requests.post(API_ENDPOINT, ...)
    response.raise_for_status()
except requests.exceptions.Timeout:
    return "[API Error] Request timed out"
except requests.exceptions.HTTPError as e:
    return f"[API Error] HTTP {e.response.status_code}"
```

### Command Execution Errors
```python
try:
    result = subprocess.run(cmd, shell=True, timeout=300)
except subprocess.TimeoutExpired:
    return "(timeout after 300s)"
except Exception as e:
    return f"(error: {str(e)})"
```

### Loop Protection
```python
max_loops = 10
for loop in range(max_loops):
    # ... processing
    if not commands:
        break  # Task complete
```

## Security Considerations

### YOLO Mode

By default, commands execute without confirmation. This is intentional for UX but requires trust.

**Mitigations:**
1. User controls API key (their own DeepSeek account)
2. Commands visible in output before execution
3. History logged for audit
4. Timeout limits (300s per command)

### API Key Storage

**Current:** Hardcoded in scripts (for convenience)

**Recommended:** Environment variable or config file
```python
API_KEY = os.environ.get("DEEPSEEK_API_KEY")
```

### Command Injection

DeepSeek could theoretically output malicious commands. The bridge executes whatever DeepSeek sends.

**Trust model:** User trusts DeepSeek API → Bridge executes → User's device

## Performance

### Latency Breakdown

| Operation | Typical Time |
|-----------|--------------|
| DeepSeek API call | 2-10s |
| Command extraction | <100ms |
| Command execution | Varies |
| History save/load | <50ms |

### Optimization Strategies

1. **Command chaining:** `cmd1 && cmd2 && cmd3`
2. **Batch operations:** Single command for multiple actions
3. **History pruning:** Remove old messages if too long
4. **Timeout tuning:** Adjust based on task complexity

## Extensibility

### Adding New Commands

The bridge can be extended to support:

```python
def extract_python_commands(content):
    return re.findall(r'```python\n(.*?)\n```', content, re.DOTALL)

def execute_python(code):
    return subprocess.run(f"python3 -c '{code}'", ...)
```

### Multi-Model Support

```python
MODELS = {
    "deepseek-reasoner": {"endpoint": "...", "key": "..."},
    "claude-3": {"endpoint": "...", "key": "..."},
    "gpt-4": {"endpoint": "...", "key": "..."},
}
```

### Plugin System

Future: Allow custom command handlers via plugins.

```python
plugins = {
    "docker": DockerPlugin(),
    "git": GitPlugin(),
    "aws": AWSPlugin(),
}
```

## Testing Strategy

### Unit Tests
- Command extraction regex
- History load/save
- API response parsing

### Integration Tests
- Full loop execution
- Error handling
- Timeout behavior

### E2E Tests
- Real API calls (with test key)
- Actual command execution
- Multi-turn conversations

## Future Enhancements

1. **Streaming responses** - Show reasoning in real-time
2. **Command preview** - Show before execute (optional)
3. **Undo system** - Track and reverse commands
4. **Sandbox mode** - Execute in container/VM
5. **Team features** - Shared history, collaboration
6. **Analytics** - Usage tracking, optimization insights
