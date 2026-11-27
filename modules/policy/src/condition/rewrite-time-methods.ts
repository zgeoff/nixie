import type { ASTNode } from '@marcbachmann/cel-js';
import { collectConditionChildren } from './collect-condition-children';
import { zonedFunctionNames } from './constants';
import { timeMethods } from './pick-refused-construct';

// Points each timestamp method with a zone at the function of the same part that reads the zone
// alone. It runs after the subset walk and the view, which both read the library's names.
export function rewriteTimeMethods(node: ASTNode): void {
  if (node.op === 'rcall') {
    const [name] = node.args;
    const part = timeMethods[name];

    if (part !== undefined) {
      Reflect.set(node.args, 0, zonedFunctionNames[part]);
    }
  }

  for (const child of collectConditionChildren(node)) {
    rewriteTimeMethods(child);
  }
}
