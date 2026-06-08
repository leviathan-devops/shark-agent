import * as path from 'path';
import * as fs from 'fs';

export interface FailurePattern {
  patternId: string;
  title: string;
  symptoms: string[];
  rootCause: string;
  fix: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PatternMatch {
  patternId: string;
  confidence: number;
  suggestedFix: string;
}

export class PatternDatabase {
  private patterns: FailurePattern[] = [];

  constructor(patternsJsonPath?: string) {
    if (patternsJsonPath && fs.existsSync(patternsJsonPath)) {
      this.load(patternsJsonPath);
    }
  }

  load(jsonPath: string): void {
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      if (Array.isArray(data)) {
        this.patterns = data;
      } else if (data.patterns && Array.isArray(data.patterns)) {
        this.patterns = data.patterns;
      }
    } catch (err) {
      console.error(`[RGE] Failed to load patterns from ${jsonPath}: ${err}`);
    }
  }

  addPattern(pattern: FailurePattern): void {
    this.patterns.push(pattern);
  }

  query(findings: string[]): PatternMatch[] {
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns) {
      let matchCount = 0;
      for (const finding of findings) {
        for (const symptom of pattern.symptoms) {
          if (finding.toLowerCase().includes(symptom.toLowerCase())) {
            matchCount++;
          }
        }
      }

      if (matchCount > 0) {
        matches.push({
          patternId: pattern.patternId,
          confidence: Math.min(1, matchCount / pattern.symptoms.length),
          suggestedFix: pattern.fix
        });
      }
    }

    return matches.sort((a: PatternMatch, b: PatternMatch) => b.confidence - a.confidence);
  }

  getPatterns(): FailurePattern[] {
    return [...this.patterns];
  }
}
