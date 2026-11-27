import type { ASTNode } from '@marcbachmann/cel-js';
import { collectConditionChildren } from './collect-condition-children';

// The parser decodes each escape in a string literal, so a literal is put in NFC here, after the
// decoding, to compare equal to the NFC text of the call.
export function normalizeConditionLiterals(node: ASTNode): void {
  if (node.op === 'value' && typeof node.args === 'string') {
    Reflect.set(node, 'args', node.args.normalize('NFC'));
  }

  for (const child of collectConditionChildren(node)) {
    normalizeConditionLiterals(child);
  }
}
