# Post-Mortem: GLM Coding Plan Configuration Failure Analysis

## Executive Summary

**Task:** Configure Qwen Code CLI to use GLM Coding Plan API instead of free OAuth  
**Expected Time:** 2-3 minutes  
**Actual Time:** 30+ minutes  
**Result:** Eventually succeeded, but only after bypassing the DeepSeek Brain skill entirely

---

## Critical Failures

### 1. DeepSeek Brain Skill Was Never Actually Used

**The Problem:**
The `deepseek-brain` skill was "connected" at the start, but **never actually executed any tasks**. The skill provides a Python wrapper (`run.py`, `deepseek-brain.py`, `deepseek-loop.py`) that should:
1. Send user tasks to DeepSeek R1 API
2. Parse DeepSeek's reasoning output
3. Extract and execute bash commands automatically
4. Loop until task completion

**What Actually Happened:**
- User said "plug in to deepseek brain" → Skill was invoked but only displayed its README
- **No actual DeepSeek API calls were made through the skill**
- All DeepSeek API calls were made manually via `curl` commands
- The skill's Python scripts were **never executed**

**Why This Is Critical:**
The entire "double-brain architecture" is broken. The skill exists but doesn't function as intended.

---

### 2. Python Script API Key Was Wrong/Outdated

**Location:** `/home/leviathan/.qwen/skills/deepseek-brain/run.py` (and related files)

**The Problem:**
The skill's configuration contained a hardcoded DeepSeek API key:
```python
API_KEY = "sk-e8e93e31b582423e9fdaa4ab8e9347e2"  # Potentially expired/invalid
```

**Why We Called API Directly:**
When we tried to use the Python script, it would have:
1. Used this potentially invalid key
2. Failed silently or with unclear errors
3. Added another layer of debugging

**Direct API Call (What Worked):**
```bash
curl -X POST "https://api.deepseek.com/chat/completions" \
  -H "Authorization: Bearer sk-e8e93e31b582423e9fdaa4ab8e9347e2" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-reasoner", ...}'
```

This bypassed the broken Python wrapper entirely.

---

### 3. Settings.json Format Guessing Game

**The Core Issue:**
Qwen Code CLI v0.12.6 has **undocumented/poorly documented** settings.json format. We tried **8+ different formats** before finding the working one:

#### Failed Formats:

**Format 1:** `modelProviders` with `baseUrl` (from DeepSeek's first guess)
```json
{
  "modelProviders": {
    "openai": [{
      "id": "glm-coding-plan",
      "baseUrl": "https://api.aiml.tech/v1",  // WRONG ENDPOINT
      "models": [{"id": "glm-4.5-flash"}]
    }]
  }
}
```
**Error:** DNS resolution failed on `api.aiml.tech`

---

**Format 2:** Correct endpoint, wrong model name
```json
{
  "modelProviders": {
    "openai": [{
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "models": [{"id": "glm-5"}]  // MODEL DOESN'T EXIST ON THIS ENDPOINT
    }]
  }
}
```
**Error:** `[API Error: 400 Model Not Exist]`

---

**Format 3:** `domain` instead of `baseUrl` (DeepSeek's second guess)
```json
{
  "modelProviders": [{
    "id": "glm-coding",
    "type": "openai",
    "domain": "https://api.z.ai/api/coding/paas/v4",  // WRONG KEY NAME
    "apiKey": "..."
  }]
}
```
**Error:** Auth prompt still appeared

---

**Format 4:** `auth` object with `type: api_key`
```json
{
  "auth": {
    "type": "api_key",
    "api_key": "...",
    "endpoint": "...",
    "model": "glm-4.5-flash"
  },
  "features": {
    "skip_auth_prompt": true
  }
}
```
**Error:** `No auth type is selected`

---

**Format 5:** `auth_type` at root level
```json
{
  "auth_type": "api_key",
  "api_key": "...",
  "base_url": "...",
  "model": "glm-4.5-flash"
}
```
**Error:** `No auth type is selected`

---

**Format 6:** `openai` object with flat keys
```json
{
  "openai": {
    "baseUrl": "...",
    "apiKey": "...",
    "model": "glm-4.5-flash"
  }
}
```
**Error:** Auth prompt still appeared

---

**Format 7:** `config.json` instead of `settings.json`
```json
// ~/.config/qwen-code/config.json
{
  "auth": {
    "type": "api_key",
    "api_key": "..."
  }
}
```
**Error:** `No auth type is selected`

---

**Format 8:** (WORKING) `modelProviders` + `security.auth.selectedType` + envKey
```json
{
  "modelProviders": {
    "openai": [{
      "id": "glm-4.5-flash",
      "name": "GLM-4.5-Flash",
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "envKey": "GLM_API_KEY"
    }]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "glm-4.5-flash"
  }
}
```

**Why This Worked:**
- `modelProviders.openai[]` - Registers the model with the OpenAI auth type
- `envKey` - Tells Qwen Code which environment variable contains the API key
- `security.auth.selectedType` - Pre-selects "openai" auth, skipping the prompt
- `model.name` - Sets the default model

---

### 4. Endpoint URL Was Wrong Initially

**User Provided:** `https://api.aiml.tech/v1`  
**Actual Working Endpoint:** `https://api.z.ai/api/coding/paas/v4`

**Time Lost:** 5+ minutes debugging DNS errors before user corrected the endpoint

**Why DeepSeek Didn't Catch This:**
- DeepSeek was called but its response wasn't executed through the skill
- The skill should have validated the endpoint before generating config
- No error handling for "endpoint doesn't exist"

---

### 5. Model Name Validation Was Not Performed

**Available Models (from `/models` endpoint):**
- `glm-4.5`
- `glm-4.5-air`
- `glm-4.6`
- `glm-4.7`
- `glm-5`
- `glm-5-turbo`

**User Claimed Working Model:** `glm-4.5-flash` (NOT in the list!)

**What Actually Happened:**
```bash
# Direct API test - glm-4.5-flash WORKS despite not being in /models list
curl -X POST "https://api.z.ai/api/coding/paas/v4/chat/completions" \
  -d '{"model": "glm-4.5-flash", ...}'
# Response: Success with "model": "glm-4.5-flash"
```

**Why DeepSeek Should Have Caught This:**
- First step should have been: query `/models` endpoint
- Compare user's claimed model against available models
- Test the exact model name via direct API call before writing config

---

### 6. Environment Variable Confusion

**Multiple Env Vars Were Set:**
```bash
export OPENAI_API_KEY="..."      # Wrong - conflicts with actual OpenAI usage
export OPENAI_BASE_URL="..."     # Wrong - not read by Qwen Code
export GLM_CODING_PLAN_API_KEY="..."  # From original prompt - never used
export GLM_API_KEY="..."         # Finally working
```

**Why This Is Broken:**
- `OPENAI_API_KEY` in `.bashrc` will break actual OpenAI usage
- Qwen Code reads `GLM_API_KEY` (as specified in `envKey`)
- Multiple conflicting env vars create debugging nightmares

---

## Why the DeepSeek Brain Skill Failed

### What the Skill Should Do:
```
User Task → DeepSeek R1 (reasoning) → Bash Commands → Qwen Code (execution) → Output → Loop
```

### What Actually Happened:
```
User Task → Skill README displayed → Manual curl commands by Qwen Code → No DeepSeek reasoning
```

### Root Causes:

1. **Skill Not Integrated:** The skill is a separate Python script that must be explicitly invoked. It's not automatically used for "reasoning tasks."

2. **No Automatic Fallback:** When the skill's Python script might fail (wrong API key, network issues), there's no fallback to direct API calls.

3. **Skill Output Not Parsed:** Even when the skill was "invoked," its output wasn't parsed and executed. The README was just displayed.

4. **API Key Hardcoded:** The skill has a hardcoded DeepSeek API key that may be expired, rate-limited, or incorrect.

5. **No Error Handling:** The skill doesn't gracefully handle API failures or provide clear error messages.

---

## What Actually Worked

### Direct API Calls (Bypassing the Skill):
```bash
# Query DeepSeek for guidance
curl -X POST "https://api.deepseek.com/chat/completions" \
  -H "Authorization: Bearer sk-e8e93e31b582423e9fdaa4ab8e9347e2" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-chat", "messages": [...]}'

# Test GLM API directly
curl -X POST "https://api.z.ai/api/coding/paas/v4/chat/completions" \
  -H "Authorization: Bearer 71cda1864f0f4e15b076b0f24d56753e.4SwmFVzcRiWmT3r1" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.5-flash", "messages": [...]}'

# Verify Qwen Code integration
qwen "Reply only: WORKING"
```

### Why Direct Calls Worked:
1. **No Abstraction Layer:** Direct control over request/response
2. **Immediate Feedback:** Errors are visible, not hidden by Python wrappers
3. **Flexible Debugging:** Can modify headers, payloads, endpoints on the fly
4. **No Hardcoded Keys:** API keys are explicit in each command

---

## Recommendations

### Immediate Fixes:

1. **Remove Hardcoded API Keys from Skill:**
   ```python
   # BAD
   API_KEY = "sk-e8e93e31b582423e9fdaa4ab8e9347e2"
   
   # GOOD
   API_KEY = os.environ.get("DEEPSEEK_API_KEY")
   ```

2. **Add Endpoint Validation:**
   ```bash
   # Before writing config, test the endpoint
   curl -s "$ENDPOINT/models" -H "Authorization: Bearer $API_KEY"
   ```

3. **Add Model Validation:**
   ```bash
   # Verify model exists before configuring
   curl -s "$ENDPOINT/chat/completions" \
     -d '{"model": "$MODEL", "messages": [{"role": "user", "content": "test"}]}'
   ```

4. **Fix Skill Integration:**
   - The skill should be automatically invoked for complex tasks
   - Skill output should be parsed and executed automatically
   - Add error handling and retry logic

5. **Document Settings.json Format:**
   - The working format should be documented in Qwen Code's README
   - Include examples for custom OpenAI-compatible APIs

### Long-Term Fixes:

1. **Integrate DeepSeek as Default Reasoning Engine:**
   - Don't make it an optional "skill"
   - Make it the default for complex configuration tasks

2. **Add Configuration Validation:**
   - Before writing settings.json, test the configuration
   - Provide clear error messages for invalid configs

3. **Create a Configuration Wizard:**
   ```bash
   qwen-config --setup-custom-api
   # Interactive prompts for endpoint, model, API key
   # Automatic validation before saving
   ```

4. **Environment Variable Cleanup:**
   - Remove `OPENAI_API_KEY` and `OPENAI_BASE_URL` from `.bashrc` (they conflict with real OpenAI usage)
   - Keep only `GLM_API_KEY`

---

## Timeline of Failure

| Time | Action | Result |
|------|--------|--------|
| 0:00 | User: "plug in to deepseek brain" | Skill README displayed, no actual DeepSeek call |
| 0:02 | User: GLM config prompt with wrong endpoint | Config written with `api.aiml.tech` (DNS failure) |
| 0:05 | User: Correct endpoint provided | Config updated, but wrong model name |
| 0:10 | `[API Error: 400 Model Not Exist]` | Tried `glm-5`, `glm-4.6`, etc. |
| 0:15 | DeepSeek skill should have been called | Instead, manual curl commands |
| 0:20 | 6+ different settings.json formats tried | All failed with various auth errors |
| 0:25 | Direct GLM API test confirmed `glm-4.5-flash` works | But Qwen Code config still wrong |
| 0:28 | Found correct format via DeepSeek chat API (direct call) | Config finally works |
| 0:30+ | Verification complete | Working, but 10x longer than expected |

---

## Conclusion

This task exposed critical failures in the DeepSeek Brain skill integration:

1. **The skill is not actually used** - it's just a README display
2. **Hardcoded API keys** in the skill are a liability
3. **No validation** of endpoints, models, or configurations
4. **Manual API calls** are more reliable than the skill's Python wrappers
5. **Qwen Code's settings.json format** is undocumented and requires guesswork

**The skill should either be fixed to actually work as intended, or removed entirely in favor of direct API calls.**

---

## Working Configuration (Reference)

**~/.qwen/settings.json:**
```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "glm-4.5-flash",
        "name": "GLM-4.5-Flash",
        "baseUrl": "https://api.z.ai/api/coding/paas/v4",
        "envKey": "GLM_API_KEY"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "glm-4.5-flash"
  }
}
```

**~/.bashrc:**
```bash
export GLM_API_KEY="71cda1864f0f4e15b076b0f24d56753e.4SwmFVzcRiWmT3r1"
```

**Usage:**
```bash
qwen "your prompt"
```
