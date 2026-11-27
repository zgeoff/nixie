import type { ASTNode } from '@marcbachmann/cel-js';

// The nodes directly under a node, in the order the parser built them.
export function collectConditionChildren(node: ASTNode): ASTNode[] {
  return collectNodes(node.args);
}

function collectNodes(value: unknown): ASTNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectNodes(item));
  }

  return isASTNode(value) ? [value] : [];
}

function isASTNode(value: unknown): value is ASTNode {
  return typeof value === 'object' && value !== null && 'op' in value && 'args' in value;
}
