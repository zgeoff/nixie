import type { ASTNode } from '@marcbachmann/cel-js';
import { collectConditionChildren } from './collect-condition-children';

// The parser's own depth setting bounds its recursion and a chain of selects, and a flat chain of
// `&&` still builds a deep tree. This counts the edges on the longest path of the tree.
export function getConditionDepth(node: ASTNode): number {
  const depths = collectConditionChildren(node).map((child) => getConditionDepth(child));

  return depths.length === 0 ? 0 : 1 + Math.max(...depths);
}
