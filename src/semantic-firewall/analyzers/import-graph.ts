import * as ts from 'typescript';
import * as path from 'node:path';

export interface ImportEdge {
  from: string;
  to: string;
  kind: ts.SyntaxKind;
}

export interface Cycle {
  nodes: string[];
  length: number;
}

export class ImportGraphAnalyzer {
  private edges: ImportEdge[] = [];

  constructor(private program: ts.Program) {}

  analyze(): { edges: ImportEdge[]; cycles: Cycle[]; entryPoints: string[] } {
    this.edges = [];
    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) continue;
      this.processFile(sourceFile);
    }

    const cycles = this.detectCycles();
    const entryPoints = this.findEntryPoints();
    return { edges: this.edges, cycles, entryPoints };
  }

  private processFile(sourceFile: ts.SourceFile): void {
    const from = sourceFile.fileName;
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const moduleText = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
        if (!moduleText.startsWith('.') && !moduleText.startsWith('/')) return;
        const resolved = path.resolve(path.dirname(from), moduleText);
        const resolvedWithExt = resolved.endsWith('.ts') ? resolved : resolved + '.ts';
        this.edges.push({ from, to: resolvedWithExt, kind: node.moduleSpecifier.kind });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  private detectCycles(): Cycle[] {
    const adjacency = new Map<string, string[]>();
    for (const edge of this.edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from)!.push(edge.to);
    }

    const cycles: Cycle[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const pathStack: string[] = [];

    function dfs(node: string): void {
      visited.add(node);
      recStack.add(node);
      pathStack.push(node);

      const neighbors = adjacency.get(node) || [];
      for (const next of neighbors) {
        if (recStack.has(next)) {
          const cycleStart = pathStack.indexOf(next);
          const cycle = pathStack.slice(cycleStart);
          cycles.push({ nodes: [...cycle], length: cycle.length });
        } else if (!visited.has(next)) {
          dfs(next);
        }
      }

      pathStack.pop();
      recStack.delete(node);
    }

    for (const node of adjacency.keys()) {
      if (!visited.has(node)) dfs(node);
    }
    cycles.sort((a: Cycle, b: Cycle) => a.length - b.length);
    return cycles;
  }

  private findEntryPoints(): string[] {
    const hasIncoming = new Set<string>();
    for (const edge of this.edges) hasIncoming.add(edge.to);
    const allFiles = new Set<string>();
    for (const edge of this.edges) { allFiles.add(edge.from); allFiles.add(edge.to); }
    return Array.from(allFiles).filter(f => !hasIncoming.has(f));
  }
}
