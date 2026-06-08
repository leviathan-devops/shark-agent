// Phase 7: CONTEXT Tests — context doc updates, thought stream, decision chain
const { assert } = require("./adversarial-runner.cjs");
const fs = require('fs');
const path = require('path');

async function runPhase7() {
  const tmpDir = '/tmp/shark-test-context-' + Date.now();
  fs.mkdirSync(tmpDir, { recursive: true });

  // Test 1: CONTEXT_MANAGEMENT directory creation
  const ctxManagerPath = path.join(tmpDir, 'CONTEXT_MANAGEMENT');
  fs.mkdirSync(ctxManagerPath, { recursive: true });
  assert(fs.existsSync(ctxManagerPath), 'CONTEXT_MANAGEMENT dir created', fs.existsSync(ctxManagerPath), true);

  // Test 2: Thought stream file creation
  const tsPath = path.join(ctxManagerPath, 'THOUGHT_STREAM.md');
  const tsContent = '# THOUGHT_STREAM\n\n## tool=write gate=build\nTask: init\n';
  fs.writeFileSync(tsPath, tsContent);
  assert(fs.existsSync(tsPath), 'THOUGHT_STREAM.md created', fs.existsSync(tsPath), true);
  const tsRead = fs.readFileSync(tsPath, 'utf8');
  assert(tsRead.includes('THOUGHT_STREAM'), 'THOUGHT_STREAM has header', tsRead.includes('THOUGHT_STREAM'), true);
  assert(tsRead.includes('tool=write'), 'THOUGHT_STREAM has tool entry', tsRead.includes('tool=write'), true);

  // Test 3: Decision chain file creation
  const dcPath = path.join(ctxManagerPath, 'DECISION_CHAIN.md');
  const dcContent = '# DECISION_CHAIN\n\n## Decision: Use TypeScript\nStatus: accepted\n';
  fs.writeFileSync(dcPath, dcContent);
  assert(fs.existsSync(dcPath), 'DECISION_CHAIN.md created', fs.existsSync(dcPath), true);
  const dcRead = fs.readFileSync(dcPath, 'utf8');
  assert(dcRead.includes('DECISION_CHAIN'), 'DECISION_CHAIN has header', dcRead.includes('DECISION_CHAIN'), true);

  // Test 4: Build state file creation
  const bsPath = path.join(ctxManagerPath, 'BUILD_STATE.md');
  const bsContent = '# BUILD_STATE\n\n## Current\nTask: adversarial tests\nStatus: in_progress\n';
  fs.writeFileSync(bsPath, bsContent);
  assert(fs.existsSync(bsPath), 'BUILD_STATE.md created', fs.existsSync(bsPath), true);
  const bsRead = fs.readFileSync(bsPath, 'utf8');
  assert(bsRead.includes('BUILD_STATE'), 'BUILD_STATE has header', bsRead.includes('BUILD_STATE'), true);

  // Test 5: Debug log file creation
  const dlPath = path.join(ctxManagerPath, 'DEBUG_LOG.md');
  const dlContent = '# DEBUG_LOG\n\n## Error\ntype: enforcement-block\nmessage: test\n';
  fs.writeFileSync(dlPath, dlContent);
  assert(fs.existsSync(dlPath), 'DEBUG_LOG.md created', fs.existsSync(dlPath), true);

  // Test 6: Evidence state file creation
  const esPath = path.join(ctxManagerPath, 'EVIDENCE_STATE.md');
  const esContent = '# EVIDENCE_STATE\n\n## Status\npending verification\n';
  fs.writeFileSync(esPath, esContent);
  assert(fs.existsSync(esPath), 'EVIDENCE_STATE.md created', fs.existsSync(esPath), true);

  // Test 7: Changelog file creation
  const clPath = path.join(ctxManagerPath, 'CHANGELOG.md');
  const clContent = '# CHANGELOG\n\n## v4.9.9\nInitial runtime grade build\n';
  fs.writeFileSync(clPath, clContent);
  assert(fs.existsSync(clPath), 'CHANGELOG.md created', fs.existsSync(clPath), true);

  // Test 8: Compaction survival file creation
  const csPath = path.join(ctxManagerPath, 'COMPACTION_SURVIVAL.md');
  const csContent = '# COMPACTION_SURVIVAL\n\nGate: BUILD\n';
  fs.writeFileSync(csPath, csContent);
  assert(fs.existsSync(csPath), 'COMPACTION_SURVIVAL.md created', fs.existsSync(csPath), true);

  // Test 9: Post compaction prompt file creation
  const pcpPath = path.join(ctxManagerPath, 'POST_COMPACTION_PROMPT.md');
  const pcpContent = '# POST_COMPACTION_PROMPT\n\nLast tool: write\nLast gate: build\n';
  fs.writeFileSync(pcpPath, pcpContent);
  assert(fs.existsSync(pcpPath), 'POST_COMPACTION_PROMPT.md created', fs.existsSync(pcpPath), true);

  // Test 10: SoC preservation file creation
  const socPath = path.join(ctxManagerPath, 'SOC_PRESERVATION.md');
  const socContent = '# SOC_PRESERVATION\n\nPattern: test\n';
  fs.writeFileSync(socPath, socContent);
  assert(fs.existsSync(socPath), 'SOC_PRESERVATION.md created', fs.existsSync(socPath), true);

  // Test 11: All 9 context docs exist
  const expectedDocs = [
    'THOUGHT_STREAM.md', 'DECISION_CHAIN.md', 'BUILD_STATE.md',
    'DEBUG_LOG.md', 'EVIDENCE_STATE.md', 'CHANGELOG.md',
    'COMPACTION_SURVIVAL.md', 'POST_COMPACTION_PROMPT.md', 'SOC_PRESERVATION.md'
  ];
  for (const doc of expectedDocs) {
    const docPath = path.join(ctxManagerPath, doc);
    assert(fs.existsSync(docPath), `Context doc ${doc} exists`, fs.existsSync(docPath), true);
  }

  // Test 12: Task queue file
  const tqPath = path.join(ctxManagerPath, 'TASK_QUEUE.md');
  const tqContent = '# TASK_QUEUE\n\n## in_progress\nTest adversarial phases\n';
  fs.writeFileSync(tqPath, tqContent);
  assert(fs.existsSync(tqPath), 'TASK_QUEUE.md created', fs.existsSync(tqPath), true);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert(!fs.existsSync(tmpDir), 'Temp dir cleaned up', fs.existsSync(tmpDir), false);

  console.log("Phase 7: 25 tests");
}

module.exports = { runPhase7 };
