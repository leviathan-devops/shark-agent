/**
 * src/eie/nodes/ci-cd-pipeline-nodes.ts — 35 CI/CD Pipeline Knowledge Nodes
 *
 * Covers continuous integration and continuous deployment best practices
 * across six domains:
 * - Pipeline (8 nodes): stages, build automation, test automation, linting, security scanning, artifacts, caching, parallelism
 * - Deployment (7 nodes): blue-green, canary, rolling, recreate, traffic shifting, rollback, deployment gates
 * - Security (6 nodes): secrets, signing, SBOM, image scanning, compliance, access control
 * - Quality (6 nodes): code coverage, mutation testing, complexity, dependencies, licenses, static analysis
 * - Release (4 nodes): semantic versioning, changelog, release notes, release approval
 * - Infrastructure (4 nodes): IaC, terraform, kustomize, helm
 *
 * Source: CI_CD_PIPELINE_BEST_PRACTICES.md
 */

import type { KnowledgeNode } from '../types';

// ══ PIPELINE (8 nodes) ═══════════════════════════════════════════

export const CICD_PIPELINE_STAGES: KnowledgeNode = {
  id: 'CICD-PIPELINE-STAGES',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — STAGE SEPARATION: Structure the CI/CD pipeline into discrete, sequential stages (lint, build, test, security, package, deploy). Each stage is a quality gate that fails fast. Stages run in order; a failure stops downstream stages, preventing known-bad artifacts from reaching production.',
  detectionMethod: 'Parse pipeline config (GitHub Actions, GitLab CI, Jenkinsfile). Flag monolithic single-job pipelines that interleave lint/build/test/deploy into one step with no early-exit gates.',
  fixTemplate: 'Split into jobs: lint (fastest), build, unit-test, integration-test, security-scan, package, deploy-staging, deploy-prod. Use needs: / stages: to enforce order. Fail one, halt the rest.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-PIPELINE-STAGES: Pipeline is monolithic (single job interleaving all steps). Split into discrete gated stages.',
  warheadTemplate: 'Monolithic pipelines run every step even when lint or build fails, wasting compute and allowing broken artifacts to propagate downstream unchecked.',
  evidenceSpec: { id: 'pipeline-stages', verify: 'fs-check', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-BUILD-AUTOMATION', 'CICD-TEST-AUTOMATION', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

export const CICD_BUILD_AUTOMATION: KnowledgeNode = {
  id: 'CICD-BUILD-AUTOMATION',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — BUILD AUTOMATION: Every commit to a tracked branch triggers an automated build. The build is deterministic, reproducible (locked dependencies, pinned toolchain), and produces a versioned artifact. No manual build steps, no "works on my machine".',
  detectionMethod: 'Check CI config for build trigger on push/PR. Flag pipelines that skip builds, use unpinned toolchain versions (latest node), or produce artifacts without a version stamp.',
  fixTemplate: 'on: push / pull_request triggers. Pin node-version via .nvmrc or matrix. Build outputs a versioned artifact tagged with git SHA. Deterministic lockfile (bun.lockb).',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-BUILD-AUTOMATION: Build not triggered on every commit, or toolchain unpinned ({toolchain}). Automate and pin.',
  warheadTemplate: 'Without automated, reproducible builds, deployments depend on a developer laptop state — guaranteeing drift, missing dependencies, and untraceable production artifacts.',
  evidenceSpec: { id: 'build-automation', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-PIPELINE-STAGES', 'CICD-ARTIFACT-MANAGEMENT', 'CICD-CACHE-STRATEGY'],
  selfVerified: true,
};

export const CICD_TEST_AUTOMATION: KnowledgeNode = {
  id: 'CICD-TEST-AUTOMATION',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — TEST AUTOMATION: The pipeline must run the full verification suite (unit, integration, e2e) on every PR before merge. Verifications run against the built artifact, not the developer checkout. Failing checks block merge, not just warn.',
  detectionMethod: 'Check CI config for the verification job. Flag pipelines that run checks on source directly (not the built artifact), skip checks on certain branches, or do not gate merges on results (branch protection missing required status check).',
  fixTemplate: 'CI job: build artifact, then run bun test against it. Enforce branch protection requiring the check to be green before merge. Never skip checks on "minor" branches.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'CICD-TEST-AUTOMATION: Checks not gating merge, run on source not artifact, or skipped on branches. Run full suite on every PR, block merge on failure.',
  warheadTemplate: 'Checks that do not gate merges are advisory theater — broken code reaches main, and the signal degrades to noise everyone learns to ignore.',
  evidenceSpec: { id: 'test-automation', verify: 'exec-build', minQuality: 0.95 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-CODE-COVERAGE', 'CICD-MUTATION-TESTING', 'CICD-PIPELINE-STAGES'],
  selfVerified: true,
};

export const CICD_LINT_AUTOMATION: KnowledgeNode = {
  id: 'CICD-LINT-AUTOMATION',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — LINT FIRST: Run the linter (eslint, biome, prettier) as the first stage — it is the fastest feedback loop. Lint failures must block the build. Configure auto-fix in pre-commit hooks but enforce in CI to catch uncommitted drift.',
  detectionMethod: 'Check CI config for lint job running before build/check. Flag pipelines with no lint step, lint as advisory (warning not error), or lint running after build (wasting time if build would have failed anyway).',
  fixTemplate: 'Job 1: lint (biome check / eslint --max-warnings=0). Runs in <10s. Job 2: build. Job 3: verify. Lint failure aborts pipeline immediately.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-LINT-AUTOMATION: No lint stage, lint as advisory, or lint after build. Run lint first as a blocking gate.',
  warheadTemplate: 'Linting as a warning-only check trains developers to ignore style violations, leading to inconsistent codebases and preventable bugs reaching production.',
  evidenceSpec: { id: 'lint-automation', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-PIPELINE-STAGES', 'CICD-STATIC-ANALYSIS', 'CICD-BUILD-AUTOMATION'],
  selfVerified: true,
};

export const CICD_SECURITY_SCAN: KnowledgeNode = {
  id: 'CICD-SECURITY-SCAN',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — SECURITY SCAN: Integrate SAST (static analysis for vulnerabilities), SCA (dependency CVE scan), and secret detection into the pipeline. Security findings of HIGH/CRITICAL severity must block deployment. Scans run on every PR and on the main branch nightly.',
  detectionMethod: 'Check CI config for security scanning jobs (CodeQL, Semgrep, Trivy fs, gitleaks). Flag pipelines with no security scan, scans that do not gate deployment, or scans that only run on main (not PRs).',
  fixTemplate: 'Add: SAST (semgrep --config=auto), SCA (trivy fs --severity HIGH,CRITICAL .), secrets (gitleaks detect). All HIGH/CRITICAL block merge. Run nightly cron scan on main for zero-day detection.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'CICD-SECURITY-SCAN: No SAST/SCA/secret scan in pipeline, or scans do not gate deploy. Add security scan with HIGH/CRITICAL gate.',
  warheadTemplate: 'A pipeline without security scanning ships vulnerable code and leaked secrets directly to production, discoverable by anyone with a dependency scanner.',
  evidenceSpec: { id: 'security-scan', verify: 'exec-build', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-DEPENDENCY-CHECK', 'CICD-IMAGE-SCAN', 'CICD-SECRET-MANAGEMENT'],
  selfVerified: true,
};

export const CICD_ARTIFACT_MANAGEMENT: KnowledgeNode = {
  id: 'CICD-ARTIFACT-MANAGEMENT',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — ARTIFACT MANAGEMENT: Every successful build produces an immutable, versioned artifact stored in a registry (Docker registry, npm registry, artifact store). The same artifact that survived the staging verification is the one deployed to production — never rebuild for prod.',
  detectionMethod: 'Check pipeline for artifact build + push step. Flag pipelines that rebuild the artifact for each environment (non-reproducible), use mutable tags (:latest), or do not retain build provenance.',
  fixTemplate: 'Build once, tag with git SHA (e.g., app:{sha}). Push to registry. Deploy the SAME SHA to staging, then prod. Promote the tag, do not rebuild. Retain provenance metadata.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'CICD-ARTIFACT-MANAGEMENT: Artifact rebuilt per environment or tagged :latest. Build once, promote the same immutable SHA.',
  warheadTemplate: 'Rebuilding for production means the artifact you verified is not the artifact you deployed — invalidating every result and breaking traceability.',
  evidenceSpec: { id: 'artifact-management', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-BUILD-AUTOMATION', 'CICD-PIPELINE-STAGES', 'CICD-SEMANTIC-VERSIONING'],
  selfVerified: true,
};

export const CICD_CACHE_STRATEGY: KnowledgeNode = {
  id: 'CICD-CACHE-STRATEGY',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — CACHING: Cache dependencies and build outputs across pipeline runs using a cache key derived from the lockfile hash. Correct cache keys (lockfile-based, not branch-based) maximize hit rates and cut build times significantly.',
  detectionMethod: 'Check CI config for cache configuration. Flag missing cache, cache keys using branch name (cache misses across branches), or caching the wrong path (e.g., caching node_modules instead of the package cache).',
  fixTemplate: 'Cache key: ${{ runner.os }}-bun-${{ hashFiles("bun.lockb") }}. Restore: ~/.bun/install/cache. Cache hits skip dependency download; lockfile change busts cache correctly.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-CACHE-STRATEGY: No dependency cache or wrong cache key (branch-based). Use lockfile-hash cache key for reliable hits.',
  warheadTemplate: 'Without proper caching, every CI run re-downloads and re-installs all dependencies, multiplying CI minutes and slowing developer feedback to a crawl.',
  evidenceSpec: { id: 'cache-strategy', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-BUILD-AUTOMATION', 'CICD-PARALLEL-JOBS', 'CICD-PIPELINE-STAGES'],
  selfVerified: true,
};

export const CICD_PARALLEL_JOBS: KnowledgeNode = {
  id: 'CICD-PARALLEL-JOBS',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'PIPELINE — PARALLELISM: Run independent jobs (lint, unit checks, integration checks, security scan) in parallel rather than sequentially. Parallel execution reduces wall-clock time. Use a dependency matrix to fan out across environments (node versions, OS) in parallel.',
  detectionMethod: 'Check CI config for job dependencies. Flag pipelines that run all jobs sequentially when they have no data dependency, or that under-utilize parallelism for cross-environment matrix testing.',
  fixTemplate: 'Use needs: only where data is shared. Lint, unit-check, security-scan run concurrently. Matrix: [node 18, node 20] x [ubuntu, macos] fans out 4 parallel builds.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-PARALLEL-JOBS: Independent jobs run sequentially. Parallelize lint/check/scan; use matrix for multi-env verification.',
  warheadTemplate: 'Sequential execution of independent CI jobs multiplies pipeline wall-clock time, delaying every PR review and slowing the entire development feedback loop.',
  evidenceSpec: { id: 'parallel-jobs', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-CACHE-STRATEGY', 'CICD-PIPELINE-STAGES', 'CICD-TEST-AUTOMATION'],
  selfVerified: true,
};

// ══ DEPLOYMENT (7 nodes) ════════════════════════════════════════

export const CICD_BLUE_GREEN: KnowledgeNode = {
  id: 'CICD-BLUE-GREEN',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — BLUE-GREEN: Maintain two identical production environments (blue/green). Deploy the new version to the idle environment, verify it, then switch traffic instantly via router/DNS. Enables instant rollback (switch back) and zero-downtime deployment.',
  detectionMethod: 'Check deployment config for two parallel environments with a traffic switch mechanism. Flag deployments with only one production environment (in-place updates) or no instant rollback path.',
  fixTemplate: 'Provision green (idle) env. Deploy new version to green. Run smoke checks against green. Switch load balancer target from blue to green. Keep blue as instant rollback for the canary window.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-BLUE-GREEN: In-place deployment with no idle standby environment. Use blue-green for instant switch and rollback.',
  warheadTemplate: 'In-place deployments cause downtime during the update window and have no instant rollback — a bad deploy means a timed-out rollback while production is broken.',
  evidenceSpec: { id: 'blue-green', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-CANARY', 'CICD-ROLLING', 'CICD-ROLLBACK'],
  selfVerified: true,
};

export const CICD_CANARY: KnowledgeNode = {
  id: 'CICD-CANARY',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — CANARY: Route a small percentage of traffic (1-5%) to the new version first. Monitor error rates, latency, and business metrics. If healthy, progressively increase (5% -> 25% -> 50% -> 100%). Auto-rollback on metric regression. Limits blast radius to the canary cohort.',
  detectionMethod: 'Check deployment config for weighted traffic routing and automated metric gates. Flag all-at-once deployments or canaries without automated rollback on metric failure (manual verification only).',
  fixTemplate: 'Route 1% to v2. Gate: error-rate < 0.1%, p99 latency < 200ms. Auto-advance: 1% -> 5% -> 25% -> 50% -> 100% with 5-minute observation windows. Auto-rollback on any gate failure.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-CANARY: All-at-once deployment or canary without automated metric gates. Use progressive traffic with auto-rollback.',
  warheadTemplate: 'All-at-once deployment exposes 100% of users to an unverified version — a regression affects every customer instantly with no automated recovery.',
  evidenceSpec: { id: 'canary', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-BLUE-GREEN', 'CICD-SHIFTING', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

export const CICD_ROLLING: KnowledgeNode = {
  id: 'CICD-ROLLING',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — ROLLING UPDATE: Replace instances incrementally (e.g., maxUnavailable: 25%, maxSurge: 25%) so old and new versions coexist during rollout. Configure health checks so the rollout pauses if new pods fail to become healthy. Never set maxUnavailable: 100% (that is a downtime deploy).',
  detectionMethod: 'Check Kubernetes Deployment spec for strategy: RollingUpdate with maxUnavailable and maxSurge. Flag maxUnavailable: 100% (equivalent to Recreate with downtime), no readiness probe, or Surge of 0 blocking rollout.',
  fixTemplate: 'strategy: type: RollingUpdate, rollingUpdate: maxUnavailable: 25%, maxSurge: 25%. Configure readinessProbe so rollout pauses if new pods are unhealthy.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-ROLLING: maxUnavailable: 100% (downtime deploy) or no readiness probe. Use 25%/25% rolling with health-gated pauses.',
  warheadTemplate: 'Rolling updates with maxUnavailable: 100% take down all instances at once, defeating the purpose of rolling deployments and causing full downtime.',
  evidenceSpec: { id: 'rolling', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-RECREATE', 'CICD-BLUE-GREEN', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

export const CICD_RECREATE: KnowledgeNode = {
  id: 'CICD-RECREATE',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — RECREATE (INTENTIONAL DOWNTIME): The Recreate strategy terminates ALL old instances before starting new ones. This is acceptable only for stateful apps requiring schema migrations or single-instance constraints. Document the downtime explicitly and schedule in maintenance windows.',
  detectionMethod: 'Check Deployment strategy: type: Recreate. Flag Recreate used for stateless services where RollingUpdate would provide zero downtime. Verify a documented maintenance window if Recreate is intentional.',
  fixTemplate: 'If stateless: switch to RollingUpdate. If stateful (DB schema migration): keep Recreate but document downtime, schedule maintenance window, and notify users. Never default to Recreate.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-RECREATE: Recreate strategy on stateless service ({service}). Use RollingUpdate, or document maintenance window if downtime is required.',
  warheadTemplate: 'Recreate on a stateless, horizontally-scaled service causes avoidable downtime that RollingUpdate would have prevented entirely.',
  evidenceSpec: { id: 'recreate', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-ROLLING', 'CICD-BLUE-GREEN', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

export const CICD_SHIFTING: KnowledgeNode = {
  id: 'CICD-SHIFTING',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — TRAFFIC SHIFTING (SHADOW/DARK LAUNCH): Route a copy of production traffic to the new version in shadow mode (responses discarded) before serving real traffic. Detects real-world failures (edge cases, data shape mismatches) without affecting users. Shift traffic by header/segment for feature-flagged subsets.',
  detectionMethod: 'Check service mesh / ingress config for shadow/mirror traffic rules or weighted traffic shifting. Flag deployments that go from 0% to 100% real traffic with no shadow verification phase.',
  fixTemplate: 'Configure Istio/Envoy mirror: 100% traffic to v1, mirror 10% to v2 (responses discarded). Monitor v2 error rate. Then shift 5% real traffic by header (internal users), expand to 100%.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-SHIFTING: No shadow/mirror phase before real traffic. Add shadow traffic to detect real-world failures pre-launch.',
  warheadTemplate: 'Without shadow traffic, the first real users to hit a new version are the canary — production data shapes and edge cases trigger failures live.',
  evidenceSpec: { id: 'traffic-shifting', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-CANARY', 'CICD-BLUE-GREEN', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

export const CICD_ROLLBACK: KnowledgeNode = {
  id: 'CICD-ROLLBACK',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — ROLLBACK READY: Every deployment must have a tested, automated rollback procedure that restores the previous known-good version. Rollback must be executable in under 5 minutes (one command or button). Database changes must be backward-compatible so rollback does not lose data.',
  detectionMethod: 'Check for rollback procedure in runbook or pipeline. Flag deployments with no rollback automation (manual only), rollbacks never rehearsed, or migrations that are not backward-compatible (blocking rollback).',
  fixTemplate: 'Pipeline: deploy.sh rollback triggers kubectl rollout undo or redeploys previous SHA. Rehearse rollback in staging quarterly. All migrations must be additive (forward then backward compatible) before the breaking step.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-ROLLBACK: No automated rollback or migrations block rollback. Implement one-command rollback; ensure backward-compatible migrations.',
  warheadTemplate: 'A deployment without a rehearsed rollback means a bad release traps the team in a manual recovery scramble while production stays broken.',
  evidenceSpec: { id: 'rollback', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-BLUE-GREEN', 'CICD-CANARY', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

export const CICD_DEPLOYMENT_GATE: KnowledgeNode = {
  id: 'CICD-DEPLOYMENT-GATE',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'DEPLOYMENT — DEPLOYMENT GATE: Production deployment requires explicit approval (manual gate) or automated quality gate (all checks green, SLOs green, security clean). Gate conditions are enforced in the pipeline, not by convention. The gate logs who approved, what version, and when.',
  detectionMethod: 'Check pipeline for environment protection rules and required reviewers on the production environment. Flag pipelines that auto-deploy to production with no gate, or gates that are advisory (not enforced).',
  fixTemplate: 'GitHub: environment: production with required_reviewers: [team]. GitLab: protected environment with approval rules. Gate requires: all CI green + 1 human approval. Audit log records approver, SHA, timestamp.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-DEPLOYMENT-GATE: Production deploys with no approval gate or unenforced gate. Require explicit approval with audit logging.',
  warheadTemplate: 'Un-gated production deploys let a failed build or a compromised CI token push directly to production with no human checkpoint.',
  evidenceSpec: { id: 'deployment-gate', verify: 'exec-build', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-ROLLBACK', 'CICD-RELEASE-APPROVAL', 'CICD-CANARY'],
  selfVerified: true,
};

// ══ SECURITY (6 nodes) ═══════════════════════════════════════════

export const CICD_SECRET_MANAGEMENT: KnowledgeNode = {
  id: 'CICD-SECRET-MANAGEMENT',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'SECURITY — SECRET MANAGEMENT: Store pipeline secrets (API keys, registry tokens, deploy keys) in a managed secret store (GitHub Secrets, Vault, AWS Secrets Manager) — never in plaintext config, committed .env, or CI variables that echo to logs. Rotate secrets regularly; scope minimally.',
  detectionMethod: 'Check pipeline config and repo for hardcoded secrets. Scan for secrets in .yml, .json, scripts. Flag CI variables used for secrets that are not marked masked/protected, or secrets committed to the repo.',
  fixTemplate: 'Use ${{ secrets.NAME }} from the secret store. Mark variables as masked and protected in CI UI. Rotate via Vault. Never commit .env to git. Run gitleaks/trufflehog in pre-commit.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'CICD-SECRET-MANAGEMENT: Secret in plaintext config, committed file, or unmasked CI variable. Move to secret store, mask in logs.',
  warheadTemplate: 'Secrets in CI configs are extractable from logs, forks, and artifact exports — a single leaked CI log exposes production credentials.',
  evidenceSpec: { id: 'secret-management', verify: 'fs-check', minQuality: 0.99 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-SECURITY-SCAN', 'CICD-ACCESS-CONTROL', 'CICD-SIGNING'],
  selfVerified: true,
};

export const CICD_SIGNING: KnowledgeNode = {
  id: 'CICD-SIGNING',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'SECURITY — ARTIFACT SIGNING: Sign every build artifact (container images, binaries, packages) with a cryptographic key (cosign, notary, gpg). Deployment must verify the signature before pulling. Signing proves provenance and detects tampering between build and deploy.',
  detectionMethod: 'Check CI pipeline for a signing step (cosign sign, notary sign). Flag unsigned artifacts deployed to production, or signing without verification at deploy time.',
  fixTemplate: 'CI: cosign sign --key $SIGNING_KEY $IMAGE. Deploy: cosign verify --key $PUB_KEY $IMAGE before kubectl apply. Use keyless signing (cosign with OIDC) for CI-native provenance.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-SIGNING: Artifacts unsigned or signatures not verified at deploy. Sign with cosign; verify before deployment.',
  warheadTemplate: 'Unsigned artifacts allow a registry compromise or MITM to swap a malicious image — no cryptographic proof distinguishes legitimate from tampered.',
  evidenceSpec: { id: 'signing', verify: 'exec-build', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-SBOM', 'CICD-IMAGE-SCAN', 'CICD-ARTIFACT-MANAGEMENT'],
  selfVerified: true,
};

export const CICD_SBOM: KnowledgeNode = {
  id: 'CICD-SBOM',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'SECURITY — SBOM (SOFTWARE BILL OF MATERIALS): Generate an SBOM (CycloneDX or SPDX format) for every build listing all dependencies and their versions. Store the SBOM with the artifact. Enables rapid impact analysis when a new CVE drops ("are we affected?").',
  detectionMethod: 'Check CI for SBOM generation step (syft, cyclonedx-bom, spdx-tools). Flag builds producing no SBOM, or SBOMs not stored alongside the artifact for later correlation.',
  fixTemplate: 'CI: syft $IMAGE -o cyclonedx-json > sbom.json. Upload sbom.json as build artifact alongside the image. On CVE alert, query SBOM: grep $CVE_PACKAGE sbom.json across all stored SBOMs.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-SBOM: No SBOM generated or stored. Generate CycloneDX/SPDX SBOM per build for CVE impact analysis.',
  warheadTemplate: 'Without an SBOM, a new critical CVE requires manually auditing every service dependencies — hours of delay while vulnerable code runs in production.',
  evidenceSpec: { id: 'sbom', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-SIGNING', 'CICD-DEPENDENCY-CHECK', 'CICD-COMPLIANCE-CHECK'],
  selfVerified: true,
};

export const CICD_IMAGE_SCAN: KnowledgeNode = {
  id: 'CICD-IMAGE-SCAN',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'SECURITY — CONTAINER IMAGE SCAN: Scan every container image after build and before push using Trivy, Grype, or Snyk. Fail the pipeline on HIGH/CRITICAL vulnerabilities with available fixes. Scan both OS packages and language dependencies inside the image.',
  detectionMethod: 'Check CI for trivy image / grype scan step with severity gate. Flag scans that do not gate the pipeline (warning only), or that do not scan the final image (scanning the builder stage instead).',
  fixTemplate: 'trivy image --severity HIGH,CRITICAL --exit-code 1 $IMAGE_TAG. Run AFTER build, BEFORE push. Gate on --exit-code 1 so HIGH/CRITICAL blocks. Fix or document risk-accepted vulnerabilities.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'CICD-IMAGE-SCAN: No image scan or scan is advisory only. Add Trivy with HIGH/CRITICAL exit-code gate before push.',
  warheadTemplate: 'Unscanned images ship known CVEs — an attacker with the same scanner finds the vulnerability in seconds while it sits unpatched in production.',
  evidenceSpec: { id: 'image-scan', verify: 'exec-build', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-SECURITY-SCAN', 'CICD-SIGNING', 'CICD-SBOM'],
  selfVerified: true,
};

export const CICD_COMPLIANCE_CHECK: KnowledgeNode = {
  id: 'CICD-COMPLIANCE-CHECK',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'SECURITY — COMPLIANCE ENFORCEMENT: Enforce compliance policies (SOC2, PCI-DSS, HIPAA, CIS benchmarks) as automated pipeline checks using policy-as-code (OPA/Rego, Checkov, kube-bench). Policy violations block deployment, not just report. Maintain an auditable compliance evidence trail.',
  detectionMethod: 'Check CI for policy-as-code scanning (checkov, kube-bench, OPA). Flag pipelines with no compliance checks, checks that are advisory, or no evidence storage for audit.',
  fixTemplate: 'CI: checkov -d kubernetes/ (IaC scan) + kube-bench (CIS benchmark). Policy fail = pipeline fail. Store SARIF output as compliance evidence artifact for auditors.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-COMPLIANCE-CHECK: No policy-as-code or advisory-only compliance. Enforce CIS/SOC2 with checkov/OPA; store evidence.',
  warheadTemplate: 'Manual compliance checks are inconsistent and un-auditable — a single missed control during a busy release can void an entire certification.',
  evidenceSpec: { id: 'compliance-check', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-ACCESS-CONTROL', 'CICD-IMAGE-SCAN', 'CICD-INFRASTRUCTURE-AS-CODE'],
  selfVerified: true,
};

export const CICD_ACCESS_CONTROL: KnowledgeNode = {
  id: 'CICD-ACCESS-CONTROL',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'SECURITY — LEAST-PRIVILEGE CI ACCESS: The CI/CD system runs with the minimum permissions required to do its job. Use short-lived OIDC tokens instead of long-lived static credentials. Scope deploy tokens per-environment. Rotate and audit access regularly.',
  detectionMethod: 'Check CI OIDC/token configuration and IAM roles. Flag CI using long-lived static access keys, a single token with access to all environments, or tokens without rotation policy.',
  fixTemplate: 'Use OIDC federation: CI assumes a short-lived role (1hr TTL) per environment. No static keys. prod-deploy role scoped to prod only. Audit: who deployed what, when, via which role.',
  conditions: [{ field: 'gate', op: 'in', value: ['VERIFY', 'AUDIT', 'DELIVERY'] }],
  bulletTemplate: 'CICD-ACCESS-CONTROL: Long-lived static CI credentials or over-permissioned deploy token. Use short-lived OIDC roles scoped per environment.',
  warheadTemplate: 'A compromised CI token with broad access is a persistent backdoor into all environments — OIDC short-lived tokens limit exposure to a single window.',
  evidenceSpec: { id: 'access-control', verify: 'exec-build', minQuality: 0.95 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-SECRET-MANAGEMENT', 'CICD-COMPLIANCE-CHECK', 'CICD-DEPLOYMENT-GATE'],
  selfVerified: true,
};

// ══ QUALITY (6 nodes) ═══════════════════════════════════════════

export const CICD_CODE_COVERAGE: KnowledgeNode = {
  id: 'CICD-CODE-COVERAGE',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'QUALITY — COVERAGE GATE: Enforce a minimum line/branch coverage threshold (e.g., 80%) that blocks PR merge if dropped. Track coverage delta per PR (did this change decrease coverage?). Coverage is necessary but not sufficient — high coverage with weak assertions is false safety.',
  detectionMethod: 'Check CI for coverage reporting and threshold enforcement. Flag pipelines with no coverage gate, or a static threshold that never increases (ratchet). Verify coverage tool excludes non-verifiable code (types, configs).',
  fixTemplate: 'CI: bun test --coverage. Enforce: coverage >= 80% AND no decrease from main (diff threshold). Upload coverage report. Exclude *.d.ts, configs from measurement.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'CICD-CODE-COVERAGE: No coverage threshold or threshold never increases. Enforce 80% minimum with per-PR ratchet.',
  warheadTemplate: 'Without a coverage gate, code coverage erodes over time as unverified features accumulate, creating dark zones where regressions hide undetected.',
  evidenceSpec: { id: 'code-coverage', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-TEST-AUTOMATION', 'CICD-MUTATION-TESTING', 'CICD-STATIC-ANALYSIS'],
  selfVerified: true,
};

export const CICD_MUTATION_TESTING: KnowledgeNode = {
  id: 'CICD-MUTATION-TESTING',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'QUALITY — MUTATION TESTING: Run mutation testing (stryker) periodically to verify check quality. Mutation testing modifies the source and checks if verifications catch the change. High coverage with low mutation score = checks that execute code but do not actually verify behavior.',
  detectionMethod: 'Check CI or nightly schedule for a mutation testing run (stryker). Flag projects with 100% coverage but no mutation verification, or mutation runs that are not gated (results ignored).',
  fixTemplate: 'Nightly: stryker run. Target mutation score >= 60%. Investigate "survived" mutants in critical paths. Do not gate every PR (slow), but act on nightly results.',
  conditions: [{ field: 'gate', op: 'in', value: ['AUDIT'] }],
  bulletTemplate: 'CICD-MUTATION-TESTING: No mutation testing despite high coverage claims. Run stryker nightly to validate assertion quality.',
  warheadTemplate: 'High coverage with weak assertions is dangerous false confidence — mutated code passing checks proves the checks would not catch real regressions.',
  evidenceSpec: { id: 'mutation-testing', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-CODE-COVERAGE', 'CICD-TEST-AUTOMATION', 'CICD-STATIC-ANALYSIS'],
  selfVerified: true,
};

export const CICD_COMPLEXITY_CHECK: KnowledgeNode = {
  id: 'CICD-COMPLEXITY-CHECK',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'QUALITY — COMPLEXITY GATE: Enforce cyclomatic and cognitive complexity limits (e.g., max cyclomatic complexity 10 per function). High-complexity functions are unverifiable, bug-prone, and resistant to change. Lint rules (eslint complexity, sonar) enforce this in CI.',
  detectionMethod: 'Check eslint/biome config for complexity rules and CI enforcement. Flag projects with no complexity limit, or a limit set so high it never triggers (e.g., 50).',
  fixTemplate: 'eslint: complexity: [error, 10], max-lines-per-function: [error, 100]. CI fails on violation. Refactor offending functions (extract, early-return, strategy pattern) rather than raising the limit.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-COMPLEXITY-CHECK: No complexity limit or limit too permissive. Enforce cyclomatic <= 10 per function in lint/CI.',
  warheadTemplate: 'Unchecked complexity compounds — functions become impossible to verify or review, and every change risks subtle regressions in tangled logic.',
  evidenceSpec: { id: 'complexity-check', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-LINT-AUTOMATION', 'CICD-STATIC-ANALYSIS', 'CICD-CODE-COVERAGE'],
  selfVerified: true,
};

export const CICD_DEPENDENCY_CHECK: KnowledgeNode = {
  id: 'CICD-DEPENDENCY-CHECK',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'QUALITY — DEPENDENCY VULNERABILITY SCAN: Scan dependencies for known CVEs on every PR and nightly (npm audit, bun audit, snyk, dependabot). Auto-generate PRs to update vulnerable deps. Gate HIGH/CRITICAL vulnerabilities with fixes available.',
  detectionMethod: 'Check CI for dependency scanning and dependabot/renovate config. Flag projects with no dependency scan, scans that are advisory, or no automated update PRs (letting vulns age).',
  fixTemplate: 'CI: bun audit / trivy fs. Dependabot: weekly schedule for security updates (daily) and minor updates (weekly). Gate: HIGH/CRITICAL with fix available blocks merge.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'VERIFY', 'AUDIT'] }],
  bulletTemplate: 'CICD-DEPENDENCY-CHECK: No CVE scan or no automated update PRs. Add audit + dependabot; gate HIGH/CRITICAL with fixes.',
  warheadTemplate: 'Stale dependencies accumulate known vulnerabilities silently — an attacker needs only a public CVE database to find an exploit path into your app.',
  evidenceSpec: { id: 'dependency-check', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-SECURITY-SCAN', 'CICD-LICENSE-CHECK', 'CICD-SBOM'],
  selfVerified: true,
};

export const CICD_LICENSE_CHECK: KnowledgeNode = {
  id: 'CICD-LICENSE-CHECK',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'QUALITY — LICENSE COMPLIANCE: Scan all dependencies for license types and block licenses incompatible with the project (GPL in a proprietary product, unknown licenses). Maintain an allowlist of approved licenses. Run license scanning in CI before release.',
  detectionMethod: 'Check CI for license scanning (license-checker, scancode, fossa). Flag projects shipping without license verification, or with no defined allowlist (everything accepted).',
  fixTemplate: 'CI: license-checker --production --failOn GPL,AGPL,LGPL,Unlicense. Define allowlist: MIT, ISC, Apache-2.0, BSD. Block unknown/copyleft licenses. Review and approve exceptions.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-LICENSE-CHECK: No license scanning or no allowlist. Scan deps; block GPL/AGPL/unknown in proprietary releases.',
  warheadTemplate: 'Shipping GPL-licensed code in a proprietary product creates a legal obligation to open-source the entire codebase — discovered post-release, this is a crisis.',
  evidenceSpec: { id: 'license-check', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-DEPENDENCY-CHECK', 'CICD-COMPLIANCE-CHECK', 'CICD-SBOM'],
  selfVerified: true,
};

export const CICD_STATIC_ANALYSIS: KnowledgeNode = {
  id: 'CICD-STATIC-ANALYSIS',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'QUALITY — STATIC ANALYSIS: Run static analysis (sonarqube, codeql, deepscan) beyond the linter to detect code smells, security hotspots, bug patterns, and architectural issues. Treat static analysis findings as actionable with severity-based triage.',
  detectionMethod: 'Check CI for static analysis tool integration. Flag projects relying on eslint alone (no deeper analysis), or with static analysis configured but quality gate disabled.',
  fixTemplate: 'CI: SonarQube scanner or CodeQL analysis on PR. Quality gate: block on new bugs/security hotspots. Address "code smell" debt to prevent entropy. Triage findings by severity.',
  conditions: [{ field: 'gate', op: 'in', value: ['BUILD', 'AUDIT'] }],
  bulletTemplate: 'CICD-STATIC-ANALYSIS: No static analysis beyond lint. Add SonarQube/CodeQL with quality gate on new findings.',
  warheadTemplate: 'Linting catches style and syntax; static analysis catches logic bugs, security patterns, and architectural decay that lint cannot see.',
  evidenceSpec: { id: 'static-analysis', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-LINT-AUTOMATION', 'CICD-COMPLEXITY-CHECK', 'CICD-SECURITY-SCAN'],
  selfVerified: true,
};

// ══ RELEASE (4 nodes) ═══════════════════════════════════════════

export const CICD_SEMANTIC_VERSIONING: KnowledgeNode = {
  id: 'CICD-SEMANTIC-VERSIONING',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'RELEASE — SEMANTIC VERSIONING: Version releases as MAJOR.MINOR.PATCH following SemVer. MAJOR = breaking changes, MINOR = backward-compatible features, PATCH = backward-compatible fixes. Derive the version bump from conventional commits (feat to minor, fix to patch, BREAKING to major) automatically.',
  detectionMethod: 'Check release process for SemVer and conventional commit parsing. Flag manual version bumps, inconsistent versioning (date-based, random), or no automated version derivation.',
  fixTemplate: 'Use conventional commits (feat:, fix:, BREAKING CHANGE:). CI: semantic-release or release-please auto-derives version + changelog from commit history. Tag git with vMAJOR.MINOR.PATCH.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-SEMANTIC-VERSIONING: Manual or inconsistent versioning. Use conventional commits + automated SemVer derivation.',
  warheadTemplate: 'Non-semantic versions give consumers no signal about breaking changes — a minor bump that breaks integration surprises every downstream consumer.',
  evidenceSpec: { id: 'semantic-versioning', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-CHANGELOG', 'CICD-RELEASE-NOTES', 'CICD-ARTIFACT-MANAGEMENT'],
  selfVerified: true,
};

export const CICD_CHANGELOG: KnowledgeNode = {
  id: 'CICD-CHANGELOG',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'RELEASE — CHANGELOG: Maintain a CHANGELOG.md following the Keep a Changelog format (Added, Changed, Deprecated, Removed, Fixed, Security). Generate it automatically from conventional commits. Every release updates the changelog as part of the release pipeline.',
  detectionMethod: 'Check repo for CHANGELOG.md and release pipeline for auto-generation. Flag missing changelog, manually-written changelog (drifts from reality), or changelog not grouped by category.',
  fixTemplate: 'semantic-release or release-please auto-generates CHANGELOG.md from conventional commits. Sections: Added/Changed/Fixed/Security. Updated automatically on each release tag.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-CHANGELOG: No CHANGELOG or manually maintained. Auto-generate from conventional commits in Keep a Changelog format.',
  warheadTemplate: 'Without a changelog, users cannot assess upgrade risk — every version is a black box, discouraging updates and hiding security fixes.',
  evidenceSpec: { id: 'changelog', verify: 'fs-check', minQuality: 0.80 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-SEMANTIC-VERSIONING', 'CICD-RELEASE-NOTES', 'CICD-RELEASE-APPROVAL'],
  selfVerified: true,
};

export const CICD_RELEASE_NOTES: KnowledgeNode = {
  id: 'CICD-RELEASE-NOTES',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'RELEASE — RELEASE NOTES: Publish user-facing release notes with every release (GitHub Release, tag announcement). Include: what changed, why it matters, breaking changes, migration steps. Machine-generated changelog is the source; curated notes add context for humans.',
  detectionMethod: 'Check release process for published release notes (GitHub Releases page). Flag releases with no notes, notes that are just the raw git log, or no callout of breaking changes.',
  fixTemplate: 'GitHub Release auto-populates from CHANGELOG. Curate: add "Breaking Changes" callout, migration steps, and impact summary. Publish on release tag. Notify stakeholders.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-RELEASE-NOTES: No release notes or raw git log only. Publish curated notes with breaking-change callouts and migration steps.',
  warheadTemplate: 'A release with no notes forces users to diff the codebase to understand impact — breaking changes go unnoticed until they cause incidents.',
  evidenceSpec: { id: 'release-notes', verify: 'fs-check', minQuality: 0.80 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-CHANGELOG', 'CICD-SEMANTIC-VERSIONING', 'CICD-RELEASE-APPROVAL'],
  selfVerified: true,
};

export const CICD_RELEASE_APPROVAL: KnowledgeNode = {
  id: 'CICD-RELEASE-APPROVAL',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'RELEASE — RELEASE APPROVAL: Public releases require explicit human approval (release manager) separate from CI passing. Approval verifies the release is intentional, release notes are accurate, and known issues are documented. Approval is logged for audit.',
  detectionMethod: 'Check release workflow for an approval gate between CI-green and publish. Flag fully automated releases with no human checkpoint, or approval by the same person who merged the code (no separation of duties).',
  fixTemplate: 'Release workflow: CI green then manual approval (release manager) then publish. Approval confirms notes, known issues, rollback plan. Separation: approver != author. Audit log records decision.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-RELEASE-APPROVAL: No human approval gate before release or no separation of duties. Require release-manager approval, logged.',
  warheadTemplate: 'Fully automated releases with no human checkpoint can publish a broken or unintended release at 3am with no one to catch it before users are affected.',
  evidenceSpec: { id: 'release-approval', verify: 'exec-build', minQuality: 0.90 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-DEPLOYMENT-GATE', 'CICD-SEMANTIC-VERSIONING', 'CICD-CHANGELOG'],
  selfVerified: true,
};

// ══ INFRASTRUCTURE (4 nodes) ════════════════════════════════════

export const CICD_INFRASTRUCTURE_AS_CODE: KnowledgeNode = {
  id: 'CICD-INFRASTRUCTURE-AS-CODE',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'INFRASTRUCTURE — IAC: Define all infrastructure (servers, networks, databases, cloud resources) as version-controlled code (Terraform, Pulumi, CloudFormation). No manual console changes. Infrastructure changes go through PR review and CI validation, same as application code.',
  detectionMethod: 'Check for IaC files in the repo and CI validation/plan steps. Flag infrastructure with manual console changes (drift), no IaC, or IaC not reviewed via PR.',
  fixTemplate: 'All infra in Terraform. PR triggers terraform plan (shows diff). Review approves. Merge triggers terraform apply. Run terraform drift detection nightly to catch manual changes.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-INFRASTRUCTURE-AS-CODE: Manual infra changes or no IaC. Define all infra in Terraform, review via PR, validate in CI.',
  warheadTemplate: 'Manual infrastructure changes create undocumented, unreviewable, unreproducible environments — a disaster recovery with no record of what was configured.',
  evidenceSpec: { id: 'infrastructure-as-code', verify: 'fs-check', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-TERRAFORM', 'CICD-COMPLIANCE-CHECK', 'CICD-PIPELINE-STAGES'],
  selfVerified: true,
};

export const CICD_TERRAFORM: KnowledgeNode = {
  id: 'CICD-TERRAFORM',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'INFRASTRUCTURE — TERRAFORM DISCIPLINE: Use Terraform with remote state (S3 + DynamoDB lock), module composition (DRY), and terraform plan in CI before apply. Never commit .tfstate (contains secrets). Pin provider versions. Validate and format (terraform fmt -check) in CI.',
  detectionMethod: 'Check Terraform config for remote state backend, module structure, and .tfstate in .gitignore. Flag local state files, no locking, unpinned providers, or missing fmt/validate in CI.',
  fixTemplate: 'Backend: S3 + DynamoDB lock. .gitignore: *.tfstate. Pin: required_providers with version constraints. CI: terraform fmt -check, validate, plan on PR; apply on merge to main.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-TERRAFORM: Local state, no lock, unpinned providers, or missing CI validation. Use remote state, pin versions, validate in CI.',
  warheadTemplate: 'Local Terraform state with no locking causes concurrent applies to corrupt state and destroy infrastructure — and committed state files leak secrets.',
  evidenceSpec: { id: 'terraform', verify: 'exec-build', minQuality: 0.85 },
  severity: 'warn',
  layer: 3,
  links: ['CICD-INFRASTRUCTURE-AS-CODE', 'CICD-COMPLIANCE-CHECK', 'CICD-PIPELINE-STAGES'],
  selfVerified: true,
};

export const CICD_KUSTOMIZE: KnowledgeNode = {
  id: 'CICD-KUSTOMIZE',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'INFRASTRUCTURE — KUSTOMIZE OVERLAYS: Use Kustomize for environment-specific Kubernetes manifests via overlay patches (base + overlays per env). Avoid duplicating full manifests per environment. Validate rendered manifests in CI (kustomize build piped to kubectl apply dry-run).',
  detectionMethod: 'Check Kubernetes config for kustomization.yaml with base/overlay structure. Flag duplicated full manifests per environment, or no CI dry-run validation of rendered output.',
  fixTemplate: 'Structure: base/ (common manifests), overlays/dev/, overlays/staging/, overlays/prod/ (environment patches). CI: kustomize build overlays/prod piped to kubectl apply --dry-run=server -f -.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-KUSTOMIZE: Duplicated manifests per environment or no rendered-manifest validation. Use base + overlays; dry-run in CI.',
  warheadTemplate: 'Duplicated manifests per environment drift — a fix applied to prod is forgotten in staging, and the environments silently diverge over time.',
  evidenceSpec: { id: 'kustomize', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-HELM', 'CICD-INFRASTRUCTURE-AS-CODE', 'CICD-PIPELINE-STAGES'],
  selfVerified: true,
};

export const CICD_HELM: KnowledgeNode = {
  id: 'CICD-HELM',
  source: 'alg-sys',
  sourceFile: 'CI_CD_PIPELINE_BEST_PRACTICES.md',
  category: 'ci-cd-pipeline',
  rule: 'INFRASTRUCTURE — HELM CHART DISCIPLINE: Use Helm for templated Kubernetes deployments. Pin chart versions, lint charts (helm lint) in CI, and validate rendered templates (helm template piped to kubeval). Store charts in a versioned OCI registry. Never use latest chart version in production.',
  detectionMethod: 'Check Helm usage for version pinning, CI lint, and template validation. Flag unpinned chart versions (:latest), charts with no lint step, or no rendered-template validation.',
  fixTemplate: 'CI: helm lint charts/, helm template charts/ piped to kubeval --strict. Pin chart version in values: chart: app, version: 1.2.3. Store in OCI registry. helm dep update to lock subcharts.',
  conditions: [{ field: 'gate', op: 'in', value: ['DELIVERY', 'AUDIT'] }],
  bulletTemplate: 'CICD-HELM: Unpinned chart version, no lint, or no template validation. Pin versions, lint in CI, validate rendered templates.',
  warheadTemplate: 'Unpinned Helm charts pull breaking changes silently on next deploy — a chart update introduces incompatible templates that fail at deploy time with no rollback.',
  evidenceSpec: { id: 'helm', verify: 'exec-build', minQuality: 0.80 },
  severity: 'warn',
  layer: 4,
  links: ['CICD-KUSTOMIZE', 'CICD-INFRASTRUCTURE-AS-CODE', 'CICD-PIPELINE-STAGES'],
  selfVerified: true,
};

// EXPORTS
export const ciCdPipelineNodes: KnowledgeNode[] = [
  // Pipeline (8)
  CICD_PIPELINE_STAGES, CICD_BUILD_AUTOMATION, CICD_TEST_AUTOMATION,
  CICD_LINT_AUTOMATION, CICD_SECURITY_SCAN, CICD_ARTIFACT_MANAGEMENT,
  CICD_CACHE_STRATEGY, CICD_PARALLEL_JOBS,
  // Deployment (7)
  CICD_BLUE_GREEN, CICD_CANARY, CICD_ROLLING,
  CICD_RECREATE, CICD_SHIFTING, CICD_ROLLBACK, CICD_DEPLOYMENT_GATE,
  // Security (6)
  CICD_SECRET_MANAGEMENT, CICD_SIGNING, CICD_SBOM,
  CICD_IMAGE_SCAN, CICD_COMPLIANCE_CHECK, CICD_ACCESS_CONTROL,
  // Quality (6)
  CICD_CODE_COVERAGE, CICD_MUTATION_TESTING, CICD_COMPLEXITY_CHECK,
  CICD_DEPENDENCY_CHECK, CICD_LICENSE_CHECK, CICD_STATIC_ANALYSIS,
  // Release (4)
  CICD_SEMANTIC_VERSIONING, CICD_CHANGELOG, CICD_RELEASE_NOTES,
  CICD_RELEASE_APPROVAL,
  // Infrastructure (4)
  CICD_INFRASTRUCTURE_AS_CODE, CICD_TERRAFORM, CICD_KUSTOMIZE, CICD_HELM,
];
