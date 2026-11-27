import type { ASTNode } from '@marcbachmann/cel-js';
import { collectConditionChildren } from './collect-condition-children';
import { listReceiverFunctionName } from './constants';

// Passes the receiver of each macro through a function that refuses anything but a list at run
// time, because a field of the arguments can hold a map. The walk refuses a macro inside a
// receiver, so the ranges never overlap.
export function wrapMacroReceivers(text: string, ast: ASTNode): string {
  return collectReceiverRanges(ast)
    .toSorted((first, second) => second.start - first.start)
    .reduce(
      (wrapped, range) =>
        `${wrapped.slice(0, range.start)}${listReceiverFunctionName}(${wrapped.slice(range.start, range.end)})${wrapped.slice(range.end)}`,
      text,
    );
}

interface Range {
  readonly start: number;
  readonly end: number;
}

function collectReceiverRanges(node: ASTNode): Range[] {
  const own: Range[] =
    node.op === 'rcall' && (node.args[0] === 'exists' || node.args[0] === 'all')
      ? [{ start: node.args[1].start, end: node.args[1].end }]
      : [];

  return [
    ...own,
    ...collectConditionChildren(node).flatMap((child) => collectReceiverRanges(child)),
  ];
}
