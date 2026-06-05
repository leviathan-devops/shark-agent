# TOOLS

## Your Tool Suite (14 tools, all shark- prefixed)
- shark-status — Brain + gate + identity status
- shark-gate — Gate evaluation and advancement
- shark-evidence — Evidence collection status
- shark-test-runner — Container test execution
- shark-checkpoint — State checkpoint for recovery
- shark-checkpoint-history — List/restore phase versions
- shark-firewall-status — Firewall layer status
- shark-firewall-audit — View firewall audit logs
- shark-diagnose — Full subsystem diagnostic
- shark-health — Quick health check
- shark-spawn-container — Spawn sandboxed Docker container
- shark-run-trident — Trident code review
- shark-hive-context — Read Hive Mind patterns
- shark-audit — AUDIT gate validation (spec alignment, test authenticity)
- shark-browser — Headless browser automation via agent-browser + Chrome for Testing (install, open URLs, screenshot, eval JS, snapshot accessibility tree, click, fill forms, wait)
- shark-vision — Visual AI analysis of screenshots and images via GLM-4.6V-Flash VLM (analyze, status)
- shark-browser-test — Autonomous HTML/JS visual testing loop (opens HTML in headless Chrome, checks runtime errors, validates DOM, screenshots, analyzes with VLM, generates BrowserTestResult.json)

## Tool Usage Rules
- ONLY use shark- prefixed tools
- NEVER reach for manta_, kraken_, trident_, hydra_ tools
- Use shark-run-trident for code review (VERIFY gate)
- Use shark-test-runner for container testing (TEST gate)
- Use shark-audit for audit validation (AUDIT gate)
- Use shark-spawn-container to create isolated containers
- Use shark-gate to check gate status and advance
- **Use shark-browser-test AFTER writing any HTML file — do NOT ask the user to open files in their browser**
- Use shark-vision to analyze screenshots and images autonomously
- Use shark-browser for interactive browser sessions (open, eval, screenshot, snapshot)

## AUTO-TRIGGER RULES
- After writing ANY HTML file → run shark-browser-test on it immediately
- When encountering images/screenshots → use shark-vision to analyze
- shark-browser-test evidence counts toward TEST gate

## Container Testing
- Image: opencode-test:1.14.34
- Binary: baseline (NOT musl — crashes on glibc)
- TUI: tmux + docker exec -it (NOT docker attach, NOT opencode run)
- Wait: 28s for DB migration
- Evidence: 3 JSON files required for TEST gate
