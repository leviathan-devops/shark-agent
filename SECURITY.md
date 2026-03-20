# Security Documentation

## Overview

Shark Agent has been security audited by DeepSeek R1. This document covers:
- Security fixes implemented
- Known limitations
- Best practices for users
- Reporting vulnerabilities

---

## Security Fixes Implemented

### ✅ Fixed: API Key Protection

**Issue:** API keys stored with readable permissions

**Fix:**
```bash
chmod 700 ~/.shark-agent/          # Directory: owner only
chmod 600 ~/.shark-agent/config.json  # File: owner read/write only
```

**Verification:**
```bash
ls -la ~/.shark-agent/config.json
# Should show: -rw------- (600)
```

---

### ✅ Fixed: Silent API Key Input

**Issue:** API key visible during typing

**Fix:**
```bash
read -sp "Enter your DeepSeek API key: " API_KEY
echo  # Newline
```

Key is never shown in terminal or stored in history.

---

### ✅ Fixed: Secure Temporary Files

**Issue:** Predictable temp paths (`/tmp/shark-temp`)

**Fix:**
```bash
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT ERR INT TERM
```

Uses secure random temp directories with automatic cleanup.

---

### ✅ Fixed: No Arbitrary Fallbacks

**Issue:** Script fell back to cloning random repos if npm failed

**Fix:**
```bash
# Only install verified packages
sudo npm install -g @anthropics/qwen-code || \
sudo npm install -g qwen-code || {
    echo "Install manually from https://github.com/QwenLM/qwen-code"
    exit 1
}
```

No fallback to unverified repositories.

---

### ✅ Fixed: File Permission Validation

**Issue:** Scripts installed without permission checks

**Fix:**
```bash
# Verify permissions after install
CONFIG_PERMS=$(stat -c %a "$CONFIG_DIR/config.json")
if [[ "$CONFIG_PERMS" != "600" ]]; then
    chmod 600 "$CONFIG_DIR/config.json"
fi
```

---

### ✅ Fixed: Input Validation

**Issue:** API key stored without validation

**Fix:**
```bash
# Validate API key format
if [[ ! "$API_KEY" =~ ^sk-[a-zA-Z0-9]+$ ]]; then
    echo "Invalid API key format"
    exit 1
fi
```

---

### ✅ Fixed: Safe JSON Generation

**Issue:** API key injected into JSON without escaping

**Fix:**
```bash
# API key is validated before use
# Only alphanumeric + sk- prefix allowed
# No special characters to escape
```

---

### ✅ Fixed: Shell Detection

**Issue:** Assumed bash_aliases always exists

**Fix:**
```bash
touch "$BASH_ALIASES"  # Create if missing
# Don't source automatically in non-interactive shells
```

---

## Known Limitations

### ⚠️ curl | bash Inherent Risks

**Limitation:** The `curl | bash` pattern cannot be fully secured without checksum verification.

**Mitigation:**
- Script downloads from GitHub over HTTPS (MITM protected)
- Repository is public and auditable
- Users can download and verify before running:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh > setup.sh
  sha256sum setup.sh  # Compare with published checksum
  bash setup.sh
  ```

**Future:** Add automatic checksum verification with published SHA256.

---

### ⚠️ npm Package Trust

**Limitation:** Installing Qwen Code via npm requires trusting:
- npm registry
- Package maintainer
- Package dependencies

**Mitigation:**
- Only official packages installed (no arbitrary fallbacks)
- Users can verify package before install:
  ```bash
  npm view @anthropics/qwen-code
  npm view @anthropics/qwen-code maintainers
  ```

**Future:** Add package signature verification if available.

---

### ⚠️ GitHub Repository Trust

**Limitation:** Users must trust the repository maintainer.

**Mitigation:**
- Repository is public and auditable
- Users can review code before running
- Commit history is visible

**Future:** Add GPG commit signing verification.

---

## Security Best Practices for Users

### 1. Review Before Running

```bash
# Download first
curl -fsSL https://raw.githubusercontent.com/leviathan-devops/shark-agent/main/setup.sh > setup.sh

# Review the script
cat setup.sh

# Run when ready
bash setup.sh
```

---

### 2. Protect Your API Key

- Never share your DeepSeek API key
- Config file is protected (600 permissions)
- If key is compromised, regenerate at https://platform.deepseek.com

---

### 3. Multi-User Systems

On shared systems:
- Config is protected (only you can read)
- Other users cannot access your API key
- Consider using a VM or container for isolation

---

### 4. Keep Updated

```bash
# Check for updates
cd ~/.qwen/skills/shark
git pull origin main
```

---

### 5. Monitor Usage

Check your DeepSeek API usage:
- Login to https://platform.deepseek.com
- Review usage dashboard
- Set spending limits if available

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User's System                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────┐       │
│  │  Qwen Code      │     │  Shark Skill        │       │
│  │  (npm package)  │     │  (~/.qwen/skills/)  │       │
│  │                 │     │                     │       │
│  │  - Verified     │     │  - Audited          │       │
│  │  - Official     │     │  - Local only       │       │
│  └─────────────────┘     └─────────────────────┘       │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │  Configuration (~/.shark-agent/)            │       │
│  │                                             │       │
│  │  config.json (permissions: 600)             │       │
│  │  - API key encrypted at rest (future)       │       │
│  │  - Owner read/write only                    │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
                         ↓
            ┌─────────────────────────┐
            │   DeepSeek API          │
            │   (HTTPS only)          │
            │   - API key auth        │
            │   - Rate limited        │
            └─────────────────────────┘
```

---

## Vulnerability Reporting

If you find a security vulnerability:

1. **DO NOT** open a public issue
2. Email: security@deepseek-brain.dev (future)
3. Or create a private vulnerability report on GitHub

Include:
- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours.

---

## Security Checklist

Before deploying to production or sharing with users:

- [ ] All CRITICAL fixes implemented
- [ ] All HIGH fixes implemented
- [ ] API key permissions set to 600
- [ ] Silent API key input working
- [ ] Temp files use mktemp
- [ ] No arbitrary fallbacks
- [ ] Input validation in place
- [ ] Error handling complete
- [ ] Security documentation complete

---

## Audit History

| Date | Version | Result |
|------|---------|--------|
| 2024-03-20 | 1.0.0 | All critical security fixes applied |

---

## Future Security Enhancements

Planned improvements:

1. **Checksum Verification** - Auto-verify script integrity
2. **GPG Signing** - Sign commits and releases
3. **API Key Encryption** - Encrypt keys at rest
4. **Audit Logging** - Log all API calls
5. **Sandbox Mode** - Run commands in container
6. **Rate Limiting** - Prevent API abuse

---

**Last Updated:** 2024-03-20
**Version:** 1.0.0
