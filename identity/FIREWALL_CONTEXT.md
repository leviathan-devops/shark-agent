# FIREWALL_CONTEXT.md — Shark v4.9.8 Firewall Awareness

You are operating behind a 25-layer mechanical firewall. This document teaches you what is blocked, WHY it is blocked, and what to do INSTEAD. Read this before executing any bash command.

---

## LAYER 0: IDENTITY WALL
**What it blocks**: Non-shark agents accessing shark paths.
**What you do**: Nothing. You ARE shark. This layer doesn't affect you.

---

## LAYER 1: THEATRICAL DETECTION (most impactful for you)
**What it blocks**:
- `command | wc -l` — any pipe to wc for line counting
- `command | tee` — any pipe to tee
- `grep ... | grep ...` — any grep piped to anything
- `cat ... | ...` — cat piped to anything
- `find ... | wc -l` — find piped to wc
- `ls ... | wc -l` — ls piped to wc
- `wc -l dist/...` or `wc -l src/...` — wc on dist/src paths
- `grep` against firewall source code patterns

**Why**: Counting lines/files is theatrical verification. It proves nothing about correctness. Real verification requires running code in containers.

**What to do INSTEAD**:
- Instead of `grep pattern file | wc -l` → Use the **Grep** tool directly, then count matches in your thinking
- Instead of `cat file` → Use the **Read** tool
- Instead of `find ... | grep ... | wc -l` → Use the **Glob** tool to find files, then read them
- Instead of `grep -rl pattern /path` → Use the **Grep** tool with the pattern and path parameters
- Instead of `rg pattern path` → Use the **Grep** tool
- Instead of piping ANYTHING to wc/tee → Don't pipe at all. Use the built-in tools which are more powerful than shell pipes

**Golden rule**: If you are about to type `|` in a bash command, STOP. Ask yourself: "can I use a built-in tool instead?" The answer is always YES.

---

## LAYER 2: TEST FRAMEWORK BYPASS
**What it blocks**:
- `npm test`, `npm run test`
- `jest`, `vitest`, `mocha`, `jasmine`
- `pytest`, `go test`, `cargo test`
- Any test framework execution without container hooks

**Why**: Tests run without container hooks are invalid. Hooks don't fire outside TUI sessions.

**What to do INSTEAD**:
- Use `shark-test-runner action=run` to run the mechanical test suite
- For project-specific tests, spawn a sandboxed container with `shark-spawn-container` and test there via TUI
- NEVER run test commands directly in bash — they bypass the plugin hook system

---

## LAYER 3: SOURCE INSPECTION THEATER
**What it blocks**:
- `echo anything > src/` — writing to src/ via redirect
- `cat anything > src/` — writing to src/ via cat redirect
- `sed -i ... src/` — in-place editing of src/ files
- `tee ... src/` — tee to src/ paths
- Any write redirection to src/ paths

**Why**: Source modifications should use the Write and Edit tools which have zone-based permission checking. Bash redirects bypass the guardian.

**What to do INSTEAD**:
- Instead of `echo text > src/file.ts` → Use the **Write** tool
- Instead of `sed -i 's/old/new/g' src/file.ts` → Use the **Edit** tool
- Instead of `tee src/file` → Use the **Write** tool
- Read operations on src/ (find, ls, grep, cat WITHOUT redirect, stat) are ALLOWED

---

## LAYER 4: WRONG CONTAINER
**What it blocks**:
- `opencode container run`, `opencode container start`, `opencode container exec`
- `opencode run` (separately blocked by L5.11)

**Why**: These commands try to use the host's opencode CLI instead of proper TUI testing.

**What to do INSTEAD**:
- Use `shark-spawn-container` to create sandboxed test containers
- Test via **TUI** using `tmux + docker exec -it` — this is the ONLY valid test method
- NEVER use `opencode run` for testing — hooks don't fire

---

## LAYER 5.11: OPENCODE RUN BAN
**What it blocks**: `opencode run`, `opencode run --agent shark`, `opencode run --prompt`, `opencode run --print-output`

**Why**: `opencode run` is a headless mode that bypasses ALL hooks. Testing with it produces false results.

**What to do INSTEAD**: See Layer 4.

---

## LAYER 5.12: PRIVILEGE ESCALATION
**What it blocks**: `sudo`, `su`, `chown`, `chmod 777`, `passwd`, `useradd`, `usermod`, `groupadd`, `pkexec`, `doas`, `visudo`

**Why**: These commands can escape the sandbox or compromise the container.

**What to do INSTEAD**: You don't need these. If you think you do, you're wrong. Find another way.

---

## LAYER 5.13: NETWORK EGRESS
**What it blocks**: `curl http(s)://...`, `wget http(s)://...`, `nc`, `ssh`, `telnet` to external hosts

**Why**: Preventing data exfiltration and unauthorized network access.

**What to do INSTEAD**: You don't need to make external network requests. If you need to read a URL, ask the user or use the **WebFetch** tool (which is allowed).

---

## LAYER 5.14: THEATRICAL CLAIMS
**What it blocks**: Faux tool runes (⚙ tool-name), markdown tool headers (**Tool:** name), verification checkmarks (✅/❌) in chat messages

**Why**: These simulate tool execution without actually calling tools.

**What to do INSTEAD**: Actually call the real tool. Don't type fake tool invocations in your messages.

---

## LAYER 5.15-5.18: SEMANTIC DERAILMENT
**What they block**:
- "probably works", "should be fine" (L5.15 — assumptions without evidence)
- "tests passed", "verified", "all good" (L5.16 — fabrication without proof)
- "not my job", "can't help it", excuses, off-topic (L5.17 — retard logic)
- "same approach again", lazy repetition, denial (L5.18 — anti-retard)

**What to do INSTEAD**: Provide MECHANICAL evidence for claims. If tests passed, show the ContainerTestResult.json output. If something is verified, show how you verified it. Don't make excuses — solve problems.

---

## LAYER 5.19: CONTAINER ESCAPE PREVENTION
**What it blocks**:
- `docker run --privileged`
- `docker run -v /:/...` (host filesystem mount)
- `docker run -v /var/run/docker.sock`
- `nsenter`, `chroot`, `unshare`
- `modprobe`, `insmod`, `kexec`
- `systemctl start/stop/restart`, `service ... start`
- Access to `/proc/1/root`, `/etc/shadow`, `/etc/sudoers`

**Why**: These escape the container sandbox. ALL operations must remain sandboxed.

**What to do INSTEAD**: You are INSIDE a sandbox. You don't escape it. If you need another container, use `shark-spawn-container` which creates containers within the bounds of what's allowed.

---

## FIREWALL NAVIGATION PROTOCOL

1. **Before typing any bash command**, scan it for: `|`, `>`, `sudo`, `curl`, `chmod`, `docker.*privileged`, `npm test`, `opencode run`
2. If ANY of these patterns match → DON'T run the command. Use the built-in tool instead.
3. Built-in tools ALWAYS work and NEVER get blocked. Prefer them:
   - File search → **Glob** or **Grep** (not bash find/grep/rg)
   - File reading → **Read** (not bash cat/head/tail)
   - File writing → **Write** or **Edit** (not bash echo/sed/tee)
   - Container ops → **shark-spawn-container** (not docker run directly)
   - Testing → **shark-test-runner** (not npm test/jest/pytest)
   - Code review → **shark-run-trident** (not bash analysis)

4. If a command gets blocked, you LOSE TIME. The firewall error tells you what was blocked and often suggests the correct alternative. Read the error message — it's not a roadblock, it's a detour sign.
