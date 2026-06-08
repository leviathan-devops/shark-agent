export interface ValidationResult { passed: boolean; issues: string[]; score: number; }
export interface EvidenceFile { suite?: string; timestamp?: number | string; results?: Array<{ name: string; passed: boolean; machineEvidence?: string; rawOutput?: string }>; generatedBy?: string; [key: string]: unknown; }

export function validateEvidence(evidence: EvidenceFile): ValidationResult {
  const issues: string[] = [];
  const results = evidence.results || [];
  const hasRawOutput = results.some((r: { name: string; passed: boolean; machineEvidence?: string; rawOutput?: string }) => !!r.rawOutput && r.rawOutput.length > 20);
  if (!hasRawOutput) issues.push('No rawOutput fields found');
  for (const r of results) {
    const me = r.machineEvidence || '';
    if (me.startsWith('Tool output:') || me.startsWith('Agent said:')) issues.push('Theatrical narrative in "' + r.name + '"');
  }
  const score = Math.max(0, 100 - issues.length * 20);
  return { passed: issues.length === 0, issues, score };
}

export function validateEvidenceBatch(files: EvidenceFile[]): ValidationResult {
  const allIssues: string[] = [];
  const timestamps: number[] = [];
  for (const file of files) {
    const result = validateEvidence(file);
    allIssues.push(...result.issues);
    if (typeof file.timestamp === 'number') timestamps.push(file.timestamp);
  }
  if (timestamps.length >= 3 && new Set(timestamps).size === 1) allIssues.push('ALL evidence files share identical timestamp — batch generated');
  return { passed: allIssues.length === 0, issues: allIssues, score: Math.max(0, 100 - allIssues.length * 10) };
}
