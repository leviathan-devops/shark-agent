import * as ts from 'typescript';

export type ConstructType =
  | 'function' | 'method' | 'arrow' | 'class' | 'interface' | 'type'
  | 'import' | 'export' | 'call' | 'return' | 'catch' | 'if'
  | 'assignment' | 'cast' | 'variable' | 'loop' | 'await'
  | 'new' | 'binary' | 'property-access' | 'string-literal';

export interface CodeConstructNode {
  type: ConstructType;
  name: string;
  node: ts.Node;
  sourceFile: ts.SourceFile;
  parent: CodeConstructNode | null;
  children: CodeConstructNode[];
  modifiers: Set<string>;
  parameters: string[];
  returnType: string;
  isDefinition: boolean;
  isCallSite: boolean;
  isAsync: boolean;
  line: number;
}

export class CodeConstructTree {
  readonly roots: CodeConstructNode[];
  readonly byType = new Map<ConstructType, CodeConstructNode[]>();
  readonly byNode = new Map<ts.Node, CodeConstructNode>();
  readonly exportedNames = new Set<string>();
  readonly size: number;

  private constructor(
    roots: CodeConstructNode[],
    byType: Map<ConstructType, CodeConstructNode[]>,
    byNode: Map<ts.Node, CodeConstructNode>,
    exportedNames: Set<string>
  ) {
    this.roots = roots;
    this.byType = byType;
    this.byNode = byNode;
    this.exportedNames = exportedNames;
    this.size = byNode.size;
  }

  static build(sourceFiles: ts.SourceFile[]): CodeConstructTree {
    const roots: CodeConstructNode[] = [];
    const allConstructs: CodeConstructNode[] = [];
    const byType = new Map<ConstructType, CodeConstructNode[]>();
    const byNode = new Map<ts.Node, CodeConstructNode>();
    const exportedNames = new Set<string>();

    for (const sf of sourceFiles) {
      ts.forEachChild(sf, (node: ts.Node) => {
        const construct = visitNode(node, null, sf, allConstructs);
        if (construct) {
          roots.push(construct);

          // Track exports — verified: getModifiers returns modifier list for declarative nodes
          const isExport =
            ts.isExportDeclaration(node) ||
            (ts.canHaveModifiers(node) &&
              (ts.getModifiers(node)?.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false));
          if (isExport && construct.name) {
            exportedNames.add(construct.name);
          }
        }
      });
    }

    // Index every collected construct (including descendants of unclassified nodes)
    // so getFunctions()/getCalls() return complete results.
    for (const c of allConstructs) {
      const list = byType.get(c.type) || [];
      list.push(c);
      byType.set(c.type, list);
      byNode.set(c.node, c);
    }

    return new CodeConstructTree(roots, byType, byNode, exportedNames);
  }

  getByType(type: ConstructType): CodeConstructNode[] {
    return this.byType.get(type) || [];
  }

  getFunctions(): CodeConstructNode[] {
    return [
      ...this.getByType('function'),
      ...this.getByType('method'),
      ...this.getByType('arrow')
    ];
  }

  getCalls(): CodeConstructNode[] {
    return this.getByType('call');
  }
}

// Recursively walk the AST, building construct nodes for classified nodes and
// collecting every construct into `allConstructs` for complete indexing.
function visitNode(
  node: ts.Node,
  parent: CodeConstructNode | null,
  sf: ts.SourceFile,
  allConstructs: CodeConstructNode[]
): CodeConstructNode | null {
  const type = classifyNode(node);
  if (!type) {
    // Unclassified node: still recurse so classified descendants are collected.
    ts.forEachChild(node, (child: ts.Node) => {
      visitNode(child, parent, sf, allConstructs);
    });
    return null;
  }

  const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const construct: CodeConstructNode = {
    type,
    name: getName(node),
    node,
    sourceFile: sf,
    parent,
    children: [],
    modifiers: new Set(getModifiers(node)),
    parameters: getParameters(node),
    returnType: getReturnType(node),
    isDefinition: isDefinition(node),
    isCallSite: isCallSite(node),
    isAsync: isAsync(node),
    line
  };
  allConstructs.push(construct);

  ts.forEachChild(node, (child: ts.Node) => {
    const childConstruct = visitNode(child, construct, sf, allConstructs);
    if (childConstruct) {
      construct.children.push(childConstruct);
    }
  });

  return construct;
}

function classifyNode(node: ts.Node): ConstructType | null {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isMethodDeclaration(node)) return 'method';
  if (ts.isArrowFunction(node)) return 'arrow';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isImportDeclaration(node)) return 'import';
  if (ts.isExportDeclaration(node)) return 'export';
  if (ts.isCallExpression(node)) return 'call';
  if (ts.isReturnStatement(node)) return 'return';
  if (ts.isCatchClause(node)) return 'catch';
  if (ts.isIfStatement(node)) return 'if';
  if (ts.isExpressionStatement(node) && node.expression.kind === ts.SyntaxKind.BinaryExpression) return 'binary';
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) return 'cast';
  if (ts.isVariableStatement(node)) return 'variable';
  if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) return 'loop';
  if (ts.isAwaitExpression(node)) return 'await';
  if (ts.isNewExpression(node)) return 'new';
  if (ts.isPropertyAccessExpression(node)) return 'property-access';
  if (ts.isStringLiteral(node)) return 'string-literal';
  return null;
}

function getName(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    return node.name?.text || 'anonymous';
  }
  if (ts.isMethodDeclaration(node)) {
    if (ts.isIdentifier(node.name)) return node.name.text;
    return node.name.getText();
  }
  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0];
    if (decl && ts.isIdentifier(decl.name)) return decl.name.text;
    return 'anon';
  }
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isIdentifier(expr)) return expr.text;
    return expr.getText();
  }
  if (ts.isImportDeclaration(node)) {
    return node.moduleSpecifier.getText().replace(/['"]/g, '');
  }
  return '';
}

function getModifiers(node: ts.Node): string[] {
  if (!ts.canHaveModifiers(node)) return [];
  return (ts.getModifiers(node) || []).map((m: ts.Modifier) => ts.SyntaxKind[m.kind]);
}

function getParameters(node: ts.Node): string[] {
  if (ts.isFunctionLike(node)) {
    return node.parameters.map((p: ts.ParameterDeclaration) => {
      if (ts.isIdentifier(p.name)) return p.name.text;
      return p.name.getText();
    });
  }
  return [];
}

function getReturnType(node: ts.Node): string {
  if (ts.isFunctionLike(node) && node.type) {
    return node.type.getText();
  }
  return '';
}

function isDefinition(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
    ts.isVariableStatement(node);
}

function isCallSite(node: ts.Node): boolean {
  return ts.isCallExpression(node) || ts.isNewExpression(node);
}

function isAsync(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return !!mods && mods.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.AsyncKeyword);
}
