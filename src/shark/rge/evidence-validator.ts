
interface ValidationError {
  field: string;
  message: string;
}

export class EvidenceValidator {
  validateReport(report: unknown): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    if (report === null || typeof report !== 'object') {
      if (!report || typeof report !== 'object') {
        errors.push({ field: 'report', message: 'Report must be an object' });
        return { valid: false, errors };
      }
      errors.push({ field: 'report', message: 'Report must be an object' });
      return { valid: false, errors };
    }

    if (typeof report === 'object' && report !== null) {
      const r = report as Record<string, unknown>;
      this.validateReportFields(r, errors);
    }

    return { valid: errors.length === 0, errors };
  }

  private validateReportFields(r: Record<string, unknown>, errors: ValidationError[]): void {
    if (typeof r.overallPassed !== 'boolean') {
      errors.push({ field: 'overallPassed', message: 'Must be a boolean' });
    }

    if (typeof r.passRate !== 'number') {
      errors.push({ field: 'passRate', message: 'Must be a number' });
    } else if (typeof r.passRate === 'number') {
      if (r.passRate < 0 || r.passRate > 1) {
        errors.push({ field: 'passRate', message: 'Must be between 0 and 1' });
      }
    }

    if (r.layers !== null && typeof r.layers === 'object') {
      const layers = r.layers as Record<string, unknown>;
      const expectedLayers = ['l0_syntactic', 'l1_type_contract', 'l2_control_flow', 'l3_architecture', 'l4_side_effect_truth', 'l5_pattern_db'];

      for (const expected of expectedLayers) {
        if (!layers[expected]) {
          errors.push({ field: `layers.${expected}`, message: 'Missing required layer' });
        } else if (layers[expected] !== null && typeof layers[expected] === 'object') {
          const layer = layers[expected] as Record<string, unknown>;
          if (typeof layer.passed !== 'boolean') {
            errors.push({ field: `layers.${expected}.passed`, message: 'Must be a boolean' });
          }
          if (!Array.isArray(layer.findings)) {
            errors.push({ field: `layers.${expected}.findings`, message: 'Must be an array' });
          }
        }
      }
    }

    if (Array.isArray(r.semanticFindings)) {
      for (let i = 0; i < r.semanticFindings.length; i++) {
        if (r.semanticFindings[i] !== null && typeof r.semanticFindings[i] === 'object') {
          const finding = r.semanticFindings[i] as Record<string, unknown>;
          if (!finding.ruleId) {
            errors.push({ field: `semanticFindings[${i}].ruleId`, message: 'Missing ruleId' });
          }
          const severity = finding.severity;
          if (typeof severity !== 'string' || !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity)) {
            errors.push({ field: `semanticFindings[${i}].severity`, message: `Invalid severity: ${finding.severity}` });
          }
        }
      }
    } else if (r.semanticFinding !== undefined) {
      errors.push({ field: 'semanticFindings', message: 'Must be an array' });
    }

    if (r.returnTo !== undefined) {
      const returnTo = r.returnTo;
      if (typeof returnTo !== 'string' || !['coder', 'reviewer', 'test_engineer'].includes(returnTo)) {
        errors.push({ field: 'returnTo', message: 'Must be coder, reviewer, or test_engineer' });
      }
    }

    if (r.fixInstructions !== undefined && !Array.isArray(r.fixInstructions)) {
      errors.push({ field: 'fixInstructions', message: 'Must be an array of strings' });
    }

    if (r.evidencePath !== undefined && typeof r.evidencePath !== 'string') {
      errors.push({ field: 'evidencePath', message: 'Must be a string path' });
    }
  }
}
