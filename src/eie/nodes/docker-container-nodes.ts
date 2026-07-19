/**
 * src/eie/nodes/docker-container-nodes.ts — 35 Docker Container Knowledge Nodes
 *
 * Covers container hardening best practices across five domains:
 * - Image optimization (8 nodes): multi-stage, minimal base, caching, context, labels, scanning, versioning, distroless
 * - Security hardening (7 nodes): non-root, no secrets, read-only rootfs, capability drop, no privileged, resource limits, healthcheck
 * - Runtime correctness (7 nodes): entrypoint, signal handling, graceful shutdown, env vars, working dir, temp files, logging
 * - Build pipeline (7 nodes): BuildKit, cache mounts, squash, multi-platform, build args, build secrets, dockerignore
 * - Orchestration (6 nodes): compose healthcheck, network isolation, volume persistence, restart policy, dependency order, resource quotas
 *
 * Source: DOCKER_CONTAINER_BEST_PRACTICES.md
 */

import type { KnowledgeNode } from '../types';

// ══ IMAGE OPTIMIZATION (8 nodes) ═══════════════════════════════

export const DOCKER_MULTI_STAGE_BUILD: KnowledgeNode = {
  id: 'DOCKER-MULTI-STAGE-BUILD',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — MULTI-STAGE BUILD: Use multi-stage builds to separate the build environment from the final runtime image. Only artifacts needed at runtime are copied into the final stage, discarding compilers, dev dependencies, and intermediate files.',
  detectionMethod: 'Parse Dockerfile. Detect single FROM with heavy build toolchain in final image. Flag images that include compilers, node_modules (dev), or build artifacts in the runtime layer.',
  fixTemplate: 'Use FROM builder AS build ... then FROM runtime and COPY --from=build /app/dist ./dist. Final stage must contain only runtime artifacts.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-MULTI-STAGE-BUILD: Final image includes build toolchain. Use multi-stage to copy only runtime artifacts.',
  warheadTemplate: 'Single-stage images ship compilers and dev dependencies to production, bloating size and expanding attack surface.',
  evidenceSpec: { id: 'multi-stage-build', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-DMINIMAL-BASE', 'DOCKER-DISTROLESS', 'DOCKER-LAYER-CACHING'],
  selfVerified: true,
};

export const DOCKER_DMINIMAL_BASE: KnowledgeNode = {
  id: 'DOCKER-DMINIMAL-BASE',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — MINIMAL BASE: Use minimal base images (alpine, debian-slim, distroless) rather than full OS images. Smaller images reduce attack surface, download time, and storage cost.',
  detectionMethod: 'Parse FROM instruction. Flag full distributions (ubuntu, debian full, centos) when minimal alternatives exist for the runtime.',
  fixTemplate: 'Replace FROM ubuntu:latest with FROM node:20-alpine or FROM node:20-slim. Match the minimal base to your runtime requirements.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-DMINIMAL-BASE: Full OS base image detected ({image}). Use alpine, slim, or distroless.',
  warheadTemplate: 'Full OS base images ship hundreds of unnecessary packages, each a potential vulnerability vector.',
  evidenceSpec: { id: 'minimal-base', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-MULTI-STAGE-BUILD', 'DOCKER-DISTROLESS', 'DOCKER-LAYER-CACHING'],
  selfVerified: true,
};

export const DOCKER_LAYER_CACHING: KnowledgeNode = {
  id: 'DOCKER-LAYER-CACHING',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — LAYER CACHING: Order Dockerfile instructions from least-frequently-changing to most-frequently-changing. Copy dependency manifests before source code so dependency layers are cached across code changes.',
  detectionMethod: 'Parse Dockerfile instruction order. Flag COPY . . before COPY package.json / dependency install step. Cache-busting order wastes rebuild time.',
  fixTemplate: 'COPY package.json bun.lockb ./ then RUN bun install then COPY . . . Dependency layer cached unless lockfile changes.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-LAYER-CACHING: Source copied before dependencies. Reorder to cache dependency layer.',
  warheadTemplate: 'Wrong layer ordering invalidates caches on every code change, causing slow builds and wasted CI resources.',
  evidenceSpec: { id: 'layer-caching', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-MULTI-STAGE-BUILD', 'DOCKER-BUILD-CONTEXT', 'DOCKER-CACHE-MOUNTS'],
  selfVerified: true,
};

export const DOCKER_BUILD_CONTEXT: KnowledgeNode = {
  id: 'DOCKER-BUILD-CONTEXT',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — BUILD CONTEXT: Minimize the Docker build context. Large contexts (node_modules, .git, build artifacts) are sent to the daemon on every build, slowing builds and risking secret leakage into layers.',
  detectionMethod: 'Check for .dockerignore file. Flag missing .dockerignore or .dockerignore that omits node_modules, .git, dist, .env.',
  fixTemplate: 'Create .dockerignore: node_modules, .git, dist, .env, *.log, coverage/, .DS_Store. Context = only what the build needs.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-BUILD-CONTEXT: No .dockerignore or incomplete. Exclude node_modules, .git, .env, dist.',
  warheadTemplate: 'Oversized build contexts slow builds and can leak secrets into intermediate layers.',
  evidenceSpec: { id: 'build-context', verify: 'fs-check', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-DOCKERIGNORE', 'DOCKER-LAYER-CACHING', 'DOCKER-NO-SECRETS'],
  selfVerified: true,
};

export const DOCKER_IMAGE_LABELING: KnowledgeNode = {
  id: 'DOCKER-IMAGE-LABELING',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — OCI LABELING: Add OCI-standard metadata labels (org.opencontainers.image.*) to images for traceability: source, version, revision, created, description, licenses.',
  detectionMethod: 'Parse Dockerfile for LABEL instructions. Flag images missing org.opencontainers.image.source and org.opencontainers.image.revision labels.',
  fixTemplate: 'LABEL org.opencontainers.image.source="$GIT_URL" org.opencontainers.image.revision="$GIT_SHA" org.opencontainers.image.created="$BUILD_DATE"',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-IMAGE-LABELING: Missing OCI metadata labels. Add org.opencontainers.image.* labels for traceability.',
  warheadTemplate: 'Unlabeled images cannot be traced to their source revision, blocking incident response and supply chain audits.',
  evidenceSpec: { id: 'image-labeling', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-IMAGE-VERSIONING', 'DOCKER-IMAGE-SCANNING', 'DOCKER-MULTI-STAGE-BUILD'],
  selfVerified: true,
};

export const DOCKER_IMAGE_SCANNING: KnowledgeNode = {
  id: 'DOCKER-IMAGE-SCANNING',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — VULNERABILITY SCANNING: Scan every image for known CVEs before deployment. Use Trivy, Grype, or Snyk. Fail builds on CRITICAL/HIGH severity findings.',
  detectionMethod: 'Check CI pipeline for image scanning step. Flag missing scan or scan without severity gate (no --severity HIGH/CRITICAL threshold).',
  fixTemplate: 'trivy image --severity HIGH,CRITICAL --severity-fail $IMAGE_TAG. Run in CI before push. Block deploy on unpatched HIGH/CRITICAL.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'DOCKER-IMAGE-SCANNING: No image vulnerability scan in pipeline. Add Trivy/Grype with severity gate.',
  warheadTemplate: 'Unscanned images ship known CVEs to production. A single unpatched HIGH vulnerability can be exploited immediately.',
  evidenceSpec: { id: 'image-scanning', verify: 'exec-build', minQuality: 0.95 },
  severity: 'block',
  layer: 5,
  links: ['DOCKER-IMAGE-VERSIONING', 'DOCKER-IMAGE-LABELING', 'DOCKER-DISTROLESS'],
  selfVerified: true,
};

export const DOCKER_IMAGE_VERSIONING: KnowledgeNode = {
  id: 'DOCKER-IMAGE-VERSIONING',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — VERSION PINNING: Pin all base image versions with explicit tags or digests. Never use :latest or floating tags. Immutable digests (sha256:) guarantee reproducibility.',
  detectionMethod: 'Parse FROM instructions. Flag :latest, unpinned tags, or tags without minor version specificity. Recommend sha256 digests for production.',
  fixTemplate: 'Replace FROM node:latest with FROM node:20.11.0-alpine or FROM node:20-alpine@sha256:<digest>. Pin exact version or digest.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-IMAGE-VERSIONING: Unpinned or :latest base image ({image}). Pin exact version or sha256 digest.',
  warheadTemplate: 'Floating tags like :latest make builds non-reproducible and can silently introduce breaking changes or vulnerabilities.',
  evidenceSpec: { id: 'image-versioning', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-IMAGE-LABELING', 'DOCKER-IMAGE-SCANNING', 'DOCKER-DMINIMAL-BASE'],
  selfVerified: true,
};

export const DOCKER_DISTROLESS: KnowledgeNode = {
  id: 'DOCKER-DISTROLESS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'IMAGE — DISTROLESS: Use Google distroless images for production runtimes. Distroless images contain only the application and its runtime dependencies — no shell, no package manager, no OS utilities.',
  detectionMethod: 'Check final stage FROM. Flag images that ship a shell or package manager in production when a distroless alternative exists.',
  fixTemplate: 'Final stage: FROM gcr.io/distroless/nodejs20-debian12. No shell = no exec-based attacks. Copy app + deps from builder stage.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-DISTROLESS: Production image includes shell/package manager. Use distroless to eliminate attack surface.',
  warheadTemplate: 'A shell in the production image allows attackers who gain RCE to pivot, install tools, and persist.',
  evidenceSpec: { id: 'distroless-base', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-MULTI-STAGE-BUILD', 'DOCKER-DMINIMAL-BASE', 'DOCKER-NON-ROOT-USER'],
  selfVerified: true,
};

// ══ SECURITY HARDENING (7 nodes) ═══════════════════════════════

export const DOCKER_NON_ROOT_USER: KnowledgeNode = {
  id: 'DOCKER-NON-ROOT-USER',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — NON-ROOT USER: Containers must run as a non-root user. Create a dedicated user with minimal permissions and switch to it with USER instruction. Root in container = root on host kernel.',
  detectionMethod: 'Parse Dockerfile for USER instruction in final stage. Flag missing USER or USER root. Verify the user is created with explicit UID.',
  fixTemplate: 'RUN addgroup -g 1001 appgroup and adduser -u 1001 -G appgroup -s /bin/sh -D appuser then USER 1001:1001. Never run as UID 0.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-NON-ROOT-USER: Container runs as root (UID 0). Create and switch to non-root user.',
  warheadTemplate: 'Running as root inside a container means a container escape yields root on the host kernel — a total compromise.',
  evidenceSpec: { id: 'non-root-user', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-READONLY-ROOTFS', 'DOCKER-CAPABILITY-DROP', 'DOCKER-DISTROLESS'],
  selfVerified: true,
};

export const DOCKER_NO_SECRETS: KnowledgeNode = {
  id: 'DOCKER-NO-SECRETS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — NO SECRETS IN IMAGE: Never embed secrets (API keys, passwords, tokens, private keys) in image layers, ENV instructions, or COPY operations. Secrets in layers are permanently visible via docker history.',
  detectionMethod: 'Scan Dockerfile for ENV with sensitive names (KEY, TOKEN, PASSWORD, SECRET). Check COPY for .env, *.key, credentials files. Scan built layers for secret patterns.',
  fixTemplate: 'Pass secrets at runtime via --mount=type=secret (build), docker secret (swarm), or environment injection at deploy. Never bake into layers.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-NO-SECRETS: Secret found in Dockerfile ENV/COPY or image layer. Inject at runtime only.',
  warheadTemplate: 'Secrets baked into image layers are extractable by anyone with access to the image — they cannot be revoked without rebuilding.',
  evidenceSpec: { id: 'no-secrets-in-image', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-BUILD-SECRETS', 'DOCKER-BUILD-CONTEXT', 'SEC-CAPABILITY-ENV'],
  selfVerified: true,
};

export const DOCKER_READONLY_ROOTFS: KnowledgeNode = {
  id: 'DOCKER-READONLY-ROOTFS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — READ-ONLY ROOTFS: Run containers with --read-only root filesystem. Temp directories (/tmp, /var/tmp) mounted as writable tmpfs. Prevents attackers from writing payloads or modifying system files.',
  detectionMethod: 'Check docker run / compose for --read-only flag. Flag containers without read-only rootfs that do not require writes to root.',
  fixTemplate: 'docker run --read-only --tmpfs /tmp:rw,size=64m $IMAGE. In compose: read_only: true, tmpfs: ["/tmp"].',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-READONLY-ROOTFS: Writable root filesystem. Add --read-only with tmpfs for /tmp.',
  warheadTemplate: 'A writable root filesystem lets attackers drop binaries, modify configs, and persist backdoors inside the container.',
  evidenceSpec: { id: 'readonly-rootfs', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-NON-ROOT-USER', 'DOCKER-CAPABILITY-DROP', 'DOCKER-TEMP-FILES'],
  selfVerified: true,
};

export const DOCKER_CAPABILITY_DROP: KnowledgeNode = {
  id: 'DOCKER-CAPABILITY-DROP',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — CAPABILITY DROP: Drop ALL Linux capabilities and add only the specific capabilities the application needs. Default Docker grants capabilities (CHOWN, NET_BIND_SERVICE, etc.) that are unnecessary for most apps.',
  detectionMethod: 'Check docker run / compose for --cap-drop. Flag containers without cap_drop: [ALL] that are not explicitly adding required capabilities.',
  fixTemplate: 'docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE $IMAGE. Default: drop ALL, add back only what is explicitly required.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-CAPABILITY-DROP: Default capabilities retained. Drop ALL and add only required caps.',
  warheadTemplate: 'Unnecessary capabilities expand the kernel attack surface available to a container-escape exploit.',
  evidenceSpec: { id: 'capability-drop', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-NON-ROOT-USER', 'DOCKER-NO-PRIVILEGED', 'DOCKER-READONLY-ROOTFS'],
  selfVerified: true,
};

export const DOCKER_NO_PRIVILEGED: KnowledgeNode = {
  id: 'DOCKER-NO-PRIVILEGED',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — NO PRIVILEGED MODE: Never run containers with --privileged. Privileged mode grants access to ALL host devices, all capabilities, and disables seccomp/AppArmor profiles. It is equivalent to running on the host.',
  detectionMethod: 'Check docker run / compose for --privileged flag or privileged: true. Flag any use of privileged mode outside of Docker-in-Docker CI with justification.',
  fixTemplate: 'Remove --privileged. If device access is needed, use --device=/dev/specific. If caps needed, use --cap-add individually.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-NO-PRIVILEGED: Container runs in privileged mode. Remove --privileged; grant specific access only.',
  warheadTemplate: 'Privileged mode is a direct path to host compromise — it disables every isolation boundary Docker provides.',
  evidenceSpec: { id: 'no-privileged', verify: 'rge-audit', minQuality: 0.99 },
  severity: 'block',
  layer: 5,
  links: ['DOCKER-CAPABILITY-DROP', 'DOCKER-NON-ROOT-USER', 'SEC-SANDBOX-ISOLATION'],
  selfVerified: true,
};

export const DOCKER_RESOURCE_LIMITS: KnowledgeNode = {
  id: 'DOCKER-RESOURCE-LIMITS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — RESOURCE LIMITS: Set memory and CPU limits on every container to prevent noisy-neighbor and resource-exhaustion attacks. Without limits, a single runaway container can starve the host.',
  detectionMethod: 'Check docker run / compose for --memory and --cpus limits. Flag containers without explicit resource limits.',
  fixTemplate: 'docker run --memory=512m --memory-swap=512m --cpus="1.0" $IMAGE. In compose: deploy.resources.limits: { memory: 512M, cpus: "1.0" }.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-RESOURCE-LIMITS: No memory/CPU limits set. Add --memory and --cpus to bound resource usage.',
  warheadTemplate: 'Containers without resource limits can be weaponized to drain host resources, causing denial of service for all co-located workloads.',
  evidenceSpec: { id: 'resource-limits', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-RESOURCE-QUOTAS', 'DOCKER-NO-PRIVILEGED', 'SEC-CAPABILITY-MEMORY'],
  selfVerified: true,
};

export const DOCKER_HEALTHCHECK: KnowledgeNode = {
  id: 'DOCKER-HEALTHCHECK',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'SECURITY — HEALTHCHECK: Define a HEALTHCHECK instruction so the runtime can detect and restart unhealthy containers. Without health checks, a hung or degraded process continues running indefinitely.',
  detectionMethod: 'Parse Dockerfile for HEALTHCHECK instruction. Flag missing HEALTHCHECK or HEALTHCHECK with unrealistic intervals (>60s).',
  fixTemplate: 'HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8080/health. The -f flag makes curl fail on HTTP errors.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-HEALTHCHECK: No HEALTHCHECK defined. Add health probe with sensible interval and timeout.',
  warheadTemplate: 'Without health checks, orchestrators cannot detect zombie or degraded processes, leading to silent service degradation.',
  evidenceSpec: { id: 'healthcheck', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-COMPOSE-HEALTHCHECK', 'DOCKER-RESTART-POLICY', 'DOCKER-GRACEFUL-SHUTDOWN'],
  selfVerified: true,
};

// ══ RUNTIME CORRECTNESS (7 nodes) ══════════════════════════════

export const DOCKER_ENTRYPOINT: KnowledgeNode = {
  id: 'DOCKER-ENTRYPOINT',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — ENTRYPOINT: Use ENTRYPOINT for the executable that always runs and CMD for default arguments that can be overridden. This enforces the container always launches the intended process.',
  detectionMethod: 'Parse Dockerfile for ENTRYPOINT and CMD. Flag using CMD alone for the executable (overridable, leading to empty containers) or mixing shell-form ENTRYPOINT.',
  fixTemplate: 'ENTRYPOINT ["node", "server.js"] then CMD ["--port", "8080"]. ENTRYPOINT = always runs. CMD = overridable defaults.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-ENTRYPOINT: Executable in CMD (overridable). Move to ENTRYPOINT; use CMD for defaults.',
  warheadTemplate: 'Using CMD for the primary executable allows runtime overrides that launch an empty or unintended process.',
  evidenceSpec: { id: 'entrypoint', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-SIGNAL-HANDLING', 'DOCKER-GRACEFUL-SHUTDOWN', 'DOCKER-WORKING-DIR'],
  selfVerified: true,
};

export const DOCKER_SIGNAL_HANDLING: KnowledgeNode = {
  id: 'DOCKER-SIGNAL-HANDLING',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — SIGNAL HANDLING: Ensure PID 1 receives and forwards OS signals (SIGTERM, SIGINT). Use exec-form ENTRYPOINT or an init system (tini, dumb-init) so signals reach the application process.',
  detectionMethod: 'Check ENTRYPOINT form. Flag shell-form ENTRYPOINT (signals not forwarded). Check for --init flag or tini/dumb-init. Test signal delivery with docker stop.',
  fixTemplate: 'Use exec-form: ENTRYPOINT ["node", "server.js"]. Or add --init: docker run --init $IMAGE. tini reaps zombies and forwards signals.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-SIGNAL-HANDLING: PID 1 does not forward signals (shell-form or missing init). Use exec-form or --init.',
  warheadTemplate: 'Without signal forwarding, docker stop waits 10s then SIGKILLs — data loss, no graceful shutdown, zombie processes accumulate.',
  evidenceSpec: { id: 'signal-handling', verify: 'exec-build', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-ENTRYPOINT', 'DOCKER-GRACEFUL-SHUTDOWN', 'DOCKER-RESTART-POLICY'],
  selfVerified: true,
};

export const DOCKER_GRACEFUL_SHUTDOWN: KnowledgeNode = {
  id: 'DOCKER-GRACEFUL-SHUTDOWN',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — GRACEFUL SHUTDOWN: Application must handle SIGTERM by draining in-flight requests, closing connections, flushing logs, and terminating within the stop grace period (default 10s). Hard SIGKILL follows if grace period expires.',
  detectionMethod: 'Check application code for SIGTERM handler. Verify it drains connections and terminates cleanly. Flag apps that ignore SIGTERM or quit immediately without cleanup.',
  fixTemplate: 'Register a SIGTERM handler: drain in-flight requests, close database connections, flush logs, then let the event loop drain naturally. Set stop_grace_period in compose if >10s needed.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-GRACEFUL-SHUTDOWN: No SIGTERM handler or handler does not drain. Implement graceful shutdown.',
  warheadTemplate: 'Ignoring SIGTERM forces SIGKILL after 10s, causing dropped connections, data corruption, and incomplete log flushing.',
  evidenceSpec: { id: 'graceful-shutdown', verify: 'exec-build', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-SIGNAL-HANDLING', 'DOCKER-ENTRYPOINT', 'DOCKER-HEALTHCHECK'],
  selfVerified: true,
};

export const DOCKER_ENV_VARS: KnowledgeNode = {
  id: 'DOCKER-ENV-VARS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — ENVIRONMENT VARIABLES: Use ENV for immutable build-time configuration and pass environment-specific config via -e / --env-file at runtime. Never hardcode environment-specific values in the image.',
  detectionMethod: 'Parse Dockerfile for ENV with environment-specific values (URLs, ports, hostnames). Flag hardcoded URLs, ports, or configs that should be runtime-injected.',
  fixTemplate: 'ENV NODE_ENV=production then at RUNTIME: docker run -e DATABASE_URL=$DATABASE_URL -e PORT=8080 $IMAGE. Build-time defaults via ENV, runtime via -e.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-ENV-VARS: Environment-specific value hardcoded in ENV. Inject at runtime via -e.',
  warheadTemplate: 'Hardcoded environment values in the image make it non-portable across stages (dev/staging/prod) and leak config.',
  evidenceSpec: { id: 'env-vars', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-NO-SECRETS', 'DOCKER-BUILD-ARGS', 'DOCKER-WORKING-DIR'],
  selfVerified: true,
};

export const DOCKER_WORKING_DIR: KnowledgeNode = {
  id: 'DOCKER-WORKING-DIR',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — WORKING DIRECTORY: Set an explicit WORKDIR instead of relying on /. A defined WORKDIR prevents path ambiguity, avoids cluttering the root filesystem, and makes COPY/ENTRYPOINT paths deterministic.',
  detectionMethod: 'Parse Dockerfile for WORKDIR instruction. Flag missing WORKDIR or WORKDIR set to /. Check that COPY/RUN paths are relative to WORKDIR.',
  fixTemplate: 'WORKDIR /app then COPY package.json . then COPY . . All subsequent commands execute in /app. Use absolute paths consistently.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-WORKING-DIR: No WORKDIR or WORKDIR is /. Set explicit WORKDIR /app for deterministic paths.',
  warheadTemplate: 'Without a WORKDIR, files scatter across the root filesystem, creating unpredictable paths and complicating debugging.',
  evidenceSpec: { id: 'working-dir', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-ENTRYPOINT', 'DOCKER-ENV-VARS', 'DOCKER-LAYER-CACHING'],
  selfVerified: true,
};

export const DOCKER_TEMP_FILES: KnowledgeNode = {
  id: 'DOCKER-TEMP-FILES',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — TEMP FILE CLEANUP: Clean up temporary files, caches, and downloads in the SAME Dockerfile layer where they are created. Files removed in a later layer still persist in the intermediate layer.',
  detectionMethod: 'Parse RUN instructions. Flag downloads (apt-get, curl, wget) without cleanup (rm) in the same layer. Check for /var/lib/apt/lists/* retention after apt-get install.',
  fixTemplate: 'RUN apt-get update and apt-get install -y curl and rm -rf /var/lib/apt/lists/*. All create + cleanup in one RUN.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-TEMP-FILES: Download/cache not cleaned in same layer. Combine install + cleanup in one RUN.',
  warheadTemplate: 'Files deleted in a later layer persist in earlier layers, inflating image size and retaining sensitive data.',
  evidenceSpec: { id: 'temp-files', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-LAYER-CACHING', 'DOCKER-MULTI-STAGE-BUILD', 'DOCKER-READONLY-ROOTFS'],
  selfVerified: true,
};

export const DOCKER_LOGGING: KnowledgeNode = {
  id: 'DOCKER-LOGGING',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'RUNTIME — LOGGING TO STDOUT/STDERR: Applications inside containers must log to stdout and stderr only. The container runtime captures these streams and forwards to the configured log driver. Never write logs to files inside the container.',
  detectionMethod: 'Check application config for file-based logging (log files, /var/log). Flag any log file writes that bypass stdout/stderr.',
  fixTemplate: 'Configure app: console.log() / process.stdout.write(). Remove file-based logging. Docker captures stdout then forwards to json-file/journald/fluentd driver.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-LOGGING: Application writes to log files instead of stdout/stderr. Log to stdout only.',
  warheadTemplate: 'File-based logging inside containers fills the writable layer, causes disk pressure, and is lost when the container is destroyed.',
  evidenceSpec: { id: 'logging-stdout', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-GRACEFUL-SHUTDOWN', 'DOCKER-ENV-VARS', 'DOCKER-READONLY-ROOTFS'],
  selfVerified: true,
};

// ══ BUILD PIPELINE (7 nodes) ═══════════════════════════════════

export const DOCKER_BUILDKIT: KnowledgeNode = {
  id: 'DOCKER-BUILDKIT',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — BUILDKIT: Use BuildKit (DOCKER_BUILDKIT=1 or buildx) for all builds. BuildKit provides parallel stage execution, cache mounts, secret mounts, and better caching than the legacy builder.',
  detectionMethod: 'Check build commands for DOCKER_BUILDKIT=1 or docker buildx. Flag use of legacy docker build without BuildKit.',
  fixTemplate: 'export DOCKER_BUILDKIT=1 and docker build ... or docker buildx build .... Enable BuildKit by default in daemon config.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-BUILDKIT: Legacy builder used. Enable BuildKit for parallel builds, cache mounts, and secrets.',
  warheadTemplate: 'The legacy builder is slower, lacks security features (secret mounts), and does not parallelize multi-stage builds.',
  evidenceSpec: { id: 'buildkit', verify: 'exec-build', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-CACHE-MOUNTS', 'DOCKER-BUILD-SECRETS', 'DOCKER-MULTI-STAGE-BUILD'],
  selfVerified: true,
};

export const DOCKER_CACHE_MOUNTS: KnowledgeNode = {
  id: 'DOCKER-CACHE-MOUNTS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — CACHE MOUNTS: Use --mount=type=cache to persist package manager caches (npm, pip, apt, cargo) across builds. Cache mounts are not included in the final image but dramatically speed up dependency installation.',
  detectionMethod: 'Check RUN instructions for --mount=type=cache. Flag dependency install steps that do not use cache mounts, causing full reinstalls every build.',
  fixTemplate: 'RUN --mount=type=cache,target=/root/.bun/install/cache bun install. Cache persists across builds, not in image.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-CACHE-MOUNTS: Dependency install without cache mount. Add --mount=type=cache for package manager cache.',
  warheadTemplate: 'Without cache mounts, every build re-downloads all dependencies, wasting CI minutes and slowing feedback loops.',
  evidenceSpec: { id: 'cache-mounts', verify: 'exec-build', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-BUILDKIT', 'DOCKER-LAYER-CACHING', 'DOCKER-MULTI-STAGE-BUILD'],
  selfVerified: true,
};

export const DOCKER_SQUASH: KnowledgeNode = {
  id: 'DOCKER-SQUASH',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — SQUASH LAYERS: Squash image layers to reduce final image size and eliminate sensitive data from intermediate layers. Use multi-stage builds as the primary method; squash as a secondary optimization.',
  detectionMethod: 'Check build command for --squash flag. Flag images with many layers containing deleted-file artifacts. Recommend multi-stage as preferred approach.',
  fixTemplate: 'docker buildx build --squash ... (experimental) or prefer multi-stage COPY --from=builder. Squash collapses layers, hiding deleted files.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-SQUASH: Many layers with deleted-file artifacts. Use multi-stage or --squash to collapse.',
  warheadTemplate: 'Deleted files in intermediate layers remain in the image tarball, retrievable by anyone who pulls the image.',
  evidenceSpec: { id: 'squash-layers', verify: 'exec-build', minQuality: 0.80 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-MULTI-STAGE-BUILD', 'DOCKER-TEMP-FILES', 'DOCKER-LAYER-CACHING'],
  selfVerified: true,
};

export const DOCKER_PLATFORM_BUILD: KnowledgeNode = {
  id: 'DOCKER-PLATFORM-BUILD',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — MULTI-PLATFORM: Build images for all target architectures (linux/amd64, linux/arm64) using buildx multi-platform builds. Ensures images run on x86 servers and ARM (Graviton, Apple Silicon) consistently.',
  detectionMethod: 'Check build command for --platform flag. Flag single-platform builds when deployment targets include multiple architectures.',
  fixTemplate: 'docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE . Use QEMU for cross-compilation. Push manifest list.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-PLATFORM-BUILD: Single-platform build only. Add --platform for amd64+arm64 targets.',
  warheadTemplate: 'Single-architecture images fail silently on ARM infrastructure, causing deployment failures in mixed-arch fleets.',
  evidenceSpec: { id: 'platform-build', verify: 'exec-build', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-BUILDKIT', 'DOCKER-MULTI-STAGE-BUILD', 'DOCKER-IMAGE-VERSIONING'],
  selfVerified: true,
};

export const DOCKER_BUILD_ARGS: KnowledgeNode = {
  id: 'DOCKER-BUILD-ARGS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — BUILD ARGS: Use ARG for build-time-only variables (versions, registry URLs, feature flags). ARG values are NOT available at runtime and do not persist in the final image environment.',
  detectionMethod: 'Parse Dockerfile for ARG vs ENV usage. Flag ENV used for build-time-only values (persists unnecessarily) and ARG used for runtime config (not available at runtime).',
  fixTemplate: 'ARG NODE_VERSION=20 then FROM node:${NODE_VERSION}-alpine. ARG for build-time only. ENV for runtime defaults. Never use ARG for secrets.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-BUILD-ARGS: Misuse of ARG/ENV — build-time value in ENV or runtime value in ARG. Use ARG for build, ENV for runtime.',
  warheadTemplate: 'Confusing ARG and ENV leads to config that is unavailable at runtime or build secrets that leak into the image environment.',
  evidenceSpec: { id: 'build-args', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-BUILD-SECRETS', 'DOCKER-ENV-VARS', 'DOCKER-IMAGE-VERSIONING'],
  selfVerified: true,
};

export const DOCKER_BUILD_SECRETS: KnowledgeNode = {
  id: 'DOCKER-BUILD-SECRETS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — BUILD SECRETS: Use --mount=type=secret to pass secrets (NPM tokens, SSH keys, API keys) to the build without baking them into any layer. Secrets are available during the build step only and never stored in the image.',
  detectionMethod: 'Check for --mount=type=secret in RUN steps. Flag ARG/ENV used for secrets (persists in layers). Flag COPY of .npmrc/.ssh keys.',
  fixTemplate: 'RUN --mount=type=secret,id=npm_token,env=NPM_TOKEN bun install. Pass via: docker buildx build --secret id=npm_token,env=NPM_TOKEN.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-BUILD-SECRETS: Secret passed via ARG/ENV/COPY. Use --mount=type=secret for build-time secrets.',
  warheadTemplate: 'Secrets in ARG or ENV are visible in docker history and intermediate layers — extractable by anyone with image access.',
  evidenceSpec: { id: 'build-secrets', verify: 'rge-audit', minQuality: 0.95 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-BUILDKIT', 'DOCKER-NO-SECRETS', 'DOCKER-BUILD-ARGS'],
  selfVerified: true,
};

export const DOCKER_DOCKERIGNORE: KnowledgeNode = {
  id: 'DOCKER-DOCKERIGNORE',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'BUILD — .dockerignore: Maintain a comprehensive .dockerignore file that excludes all non-build files: VCS (.git), dependencies (node_modules), build artifacts (dist, coverage), IDE configs, OS files, and especially .env files.',
  detectionMethod: 'Check for .dockerignore file existence and contents. Flag missing .dockerignore or one that does not exclude .git, node_modules, .env, dist, coverage.',
  fixTemplate: '.dockerignore: **/.git, **/node_modules, **/dist, **/.env*, **/*.log, **/coverage, .DS_Store, .vscode/. Exclude everything, include only build essentials.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-DOCKERIGNORE: Missing or incomplete .dockerignore. Exclude .git, node_modules, .env, dist, coverage.',
  warheadTemplate: 'A missing .dockerignore sends .env, .git, and node_modules to the build daemon — leaking secrets and inflating context.',
  evidenceSpec: { id: 'dockerignore', verify: 'fs-check', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-BUILD-CONTEXT', 'DOCKER-NO-SECRETS', 'DOCKER-LAYER-CACHING'],
  selfVerified: true,
};

// ══ ORCHESTRATION (6 nodes) ════════════════════════════════════

export const DOCKER_COMPOSE_HEALTHCHECK: KnowledgeNode = {
  id: 'DOCKER-COMPOSE-HEALTHCHECK',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'ORCHESTRATION — COMPOSE HEALTHCHECK: Define health checks in docker-compose.yml for every service. Use healthcheck with test, interval, timeout, retries, and start_period. Orchestration relies on health status to manage service lifecycle.',
  detectionMethod: 'Parse docker-compose.yml for healthcheck blocks. Flag services missing healthcheck or with conditions: service_started instead of service_healthy in depends_on.',
  fixTemplate: 'healthcheck: test: ["CMD", "curl", "-f", "http://localhost:8080/health"], interval: 30s, timeout: 5s, retries: 3, start_period: 10s.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-COMPOSE-HEALTHCHECK: Service missing healthcheck in compose. Add test, interval, timeout, retries.',
  warheadTemplate: 'Without compose healthchecks, dependent services start before the dependency is ready, causing cascading startup failures.',
  evidenceSpec: { id: 'compose-healthcheck', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-HEALTHCHECK', 'DOCKER-DEPENDENCY-ORDER', 'DOCKER-RESTART-POLICY'],
  selfVerified: true,
};

export const DOCKER_NETWORK_ISOLATION: KnowledgeNode = {
  id: 'DOCKER-NETWORK-ISOLATION',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'ORCHESTRATION — NETWORK ISOLATION: Use custom Docker networks to isolate services. Frontend services on a public network, backend services on an internal-only network. Never expose database ports to the host unless debugging.',
  detectionMethod: 'Check docker-compose.yml network definitions. Flag services on default bridge network, databases with ports exposed to host, or all services on a single flat network.',
  fixTemplate: 'Define networks: frontend (external), backend (internal). Frontend connects to both. DB connects to backend only. No ports: on DB.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-NETWORK-ISOLATION: Flat network or database ports exposed. Isolate with custom networks.',
  warheadTemplate: 'Exposing database ports to the host and using a flat network allows lateral movement from a compromised frontend to the database.',
  evidenceSpec: { id: 'network-isolation', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-VOLUME-PERSISTENCE', 'SEC-SANDBOX-ISOLATION', 'SEC-NETWORK-MODEL'],
  selfVerified: true,
};

export const DOCKER_VOLUME_PERSISTENCE: KnowledgeNode = {
  id: 'DOCKER-VOLUME-PERSISTENCE',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'ORCHESTRATION — VOLUME PERSISTENCE: Use named volumes for persistent data (databases, uploads, logs). Never rely on the container writable layer for data that must survive container recreation. Bind mounts for dev, named volumes for prod.',
  detectionMethod: 'Check docker-compose.yml for volumes definitions. Flag services writing to the container writable layer for data that needs persistence. Flag anonymous volumes.',
  fixTemplate: 'volumes: db_data: then db service: volumes: [db_data:/var/lib/postgresql/data]. Named volumes managed by Docker, survive recreation.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-VOLUME-PERSISTENCE: Persistent data on writable layer or anonymous volume. Use named volumes.',
  warheadTemplate: 'Data on the container writable layer is destroyed when the container is recreated — causing silent data loss on every deploy.',
  evidenceSpec: { id: 'volume-persistence', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-READONLY-ROOTFS', 'DOCKER-NETWORK-ISOLATION', 'DOCKER-RESTART-POLICY'],
  selfVerified: true,
};

export const DOCKER_RESTART_POLICY: KnowledgeNode = {
  id: 'DOCKER-RESTART-POLICY',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'ORCHESTRATION — RESTART POLICY: Set an appropriate restart policy on every container. Use unless-stopped for services that must survive host reboots. Avoid always for services that should stop when explicitly stopped.',
  detectionMethod: 'Check docker run / compose for restart policy. Flag containers without restart policy or with no (default) in production. Verify policy matches service role.',
  fixTemplate: 'restart: unless-stopped (survives reboots, respects explicit stop). Use no only for one-shot jobs. Avoid always (restarts even after explicit stop).',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-RESTART-POLICY: No restart policy (default: no). Set restart: unless-stopped for production services.',
  warheadTemplate: 'Without a restart policy, a crashed container stays down until manual intervention, causing extended outages.',
  evidenceSpec: { id: 'restart-policy', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-HEALTHCHECK', 'DOCKER-COMPOSE-HEALTHCHECK', 'DOCKER-GRACEFUL-SHUTDOWN'],
  selfVerified: true,
};

export const DOCKER_DEPENDENCY_ORDER: KnowledgeNode = {
  id: 'DOCKER-DEPENDENCY-ORDER',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'ORCHESTRATION — DEPENDENCY ORDER: Define service start order with depends_on using condition: service_healthy. This ensures a service only starts after its dependencies pass their health check, preventing startup race conditions.',
  detectionMethod: 'Parse docker-compose.yml depends_on blocks. Flag depends_on without condition, or condition: service_started (starts immediately, before dependency is ready).',
  fixTemplate: 'depends_on: db: condition: service_healthy. redis: condition: service_healthy. App starts only after deps pass healthcheck.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-DEPENDENCY-ORDER: depends_on without service_healthy condition. Services start before deps are ready.',
  warheadTemplate: 'Starting a service before its dependencies are ready causes connection failures, crash loops, and cascading startup failures.',
  evidenceSpec: { id: 'dependency-order', verify: 'rge-audit', minQuality: 0.90 },
  severity: 'block',
  layer: 4,
  links: ['DOCKER-COMPOSE-HEALTHCHECK', 'DOCKER-HEALTHCHECK', 'DOCKER-RESTART-POLICY'],
  selfVerified: true,
};

export const DOCKER_RESOURCE_QUOTAS: KnowledgeNode = {
  id: 'DOCKER-RESOURCE-QUOTAS',
  source: 'alg-sys',
  sourceFile: 'DOCKER_CONTAINER_BEST_PRACTICES.md',
  category: 'docker-container',
  rule: 'ORCHESTRATION — RESOURCE QUOTAS: Set both limits and reservations in compose deploy.resources. Limits cap maximum usage (hard cap). Reservations guarantee minimum allocation (soft floor). Without reservations, limits can starve co-located services.',
  detectionMethod: 'Check docker-compose.yml deploy.resources for both limits and reservations. Flag services with limits but no reservations, or neither.',
  fixTemplate: 'deploy: resources: limits: { cpus: "1.0", memory: 512M }, reservations: { cpus: "0.25", memory: 128M }. Limit = ceiling, reservation = guaranteed floor.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'DOCKER-RESOURCE-QUOTAS: Missing limits or reservations. Set both: limits (ceiling) + reservations (guaranteed floor).',
  warheadTemplate: 'Without resource reservations, the scheduler cannot guarantee CPU/memory for critical services under contention, causing unpredictable latency.',
  evidenceSpec: { id: 'resource-quotas', verify: 'rge-audit', minQuality: 0.85 },
  severity: 'block',
  layer: 3,
  links: ['DOCKER-RESOURCE-LIMITS', 'DOCKER-HEALTHCHECK', 'DOCKER-RESTART-POLICY'],
  selfVerified: true,
};

// EXPORTS
export const dockerContainerNodes: KnowledgeNode[] = [
  // Image (8)
  DOCKER_MULTI_STAGE_BUILD, DOCKER_DMINIMAL_BASE, DOCKER_LAYER_CACHING,
  DOCKER_BUILD_CONTEXT, DOCKER_IMAGE_LABELING, DOCKER_IMAGE_SCANNING,
  DOCKER_IMAGE_VERSIONING, DOCKER_DISTROLESS,
  // Security (7)
  DOCKER_NON_ROOT_USER, DOCKER_NO_SECRETS, DOCKER_READONLY_ROOTFS,
  DOCKER_CAPABILITY_DROP, DOCKER_NO_PRIVILEGED, DOCKER_RESOURCE_LIMITS,
  DOCKER_HEALTHCHECK,
  // Runtime (7)
  DOCKER_ENTRYPOINT, DOCKER_SIGNAL_HANDLING, DOCKER_GRACEFUL_SHUTDOWN,
  DOCKER_ENV_VARS, DOCKER_WORKING_DIR, DOCKER_TEMP_FILES, DOCKER_LOGGING,
  // Build (7)
  DOCKER_BUILDKIT, DOCKER_CACHE_MOUNTS, DOCKER_SQUASH,
  DOCKER_PLATFORM_BUILD, DOCKER_BUILD_ARGS, DOCKER_BUILD_SECRETS,
  DOCKER_DOCKERIGNORE,
  // Orchestration (6)
  DOCKER_COMPOSE_HEALTHCHECK, DOCKER_NETWORK_ISOLATION, DOCKER_VOLUME_PERSISTENCE,
  DOCKER_RESTART_POLICY, DOCKER_DEPENDENCY_ORDER, DOCKER_RESOURCE_QUOTAS,
];
