import type { ASTNode } from '@marcbachmann/cel-js';
import { serialize } from '@marcbachmann/cel-js';
import { match } from 'ts-pattern';
import { timeMethods } from './pick-refused-construct';
import type { CompareOp, ConditionView, Literal, Subject } from './types';

// The loop variable of the macro being read, or null outside one
type Scope = string | null;

// The structured view that the card renders. A part with no phrase becomes code, so every parsed
// condition has a view.
export function buildConditionView(node: ASTNode, scope: Scope = null): ConditionView {
  return match(node)
    .with({ op: '&&' }, (all) => ({
      kind: 'all' as const,
      parts: flattenParts(all, '&&').map((part) => buildConditionView(part, scope)),
    }))
    .with({ op: '||' }, (any) => ({
      kind: 'any' as const,
      parts: flattenParts(any, '||').map((part) => buildConditionView(part, scope)),
    }))
    .with({ op: '!_' }, (negation) => ({
      kind: 'not' as const,
      part: buildConditionView(negation.args, scope),
    }))
    .otherwise((other) => buildLeafView(other, scope));
}

function flattenParts(node: ASTNode, op: '&&' | '||'): readonly ASTNode[] {
  return node.op === op ? node.args.flatMap((part) => flattenParts(part, op)) : [node];
}

function buildLeafView(node: ASTNode, scope: Scope): ConditionView {
  const code: ConditionView = { kind: 'code', source: serialize(node) };

  if (isCompareNode(node)) {
    return buildCompareView(node, scope) ?? code;
  }

  return match(node)
    .with({ op: 'in' }, (membership) => {
      const values = toLiteral(membership.args[1]);

      return Array.isArray(values)
        ? { kind: 'in' as const, subject: toSubject(membership.args[0], scope), values }
        : code;
    })
    .with({ op: 'call' }, (call) => {
      const [name, [argument]] = call.args;

      return name === 'has' && argument !== undefined && isSelectNode(argument)
        ? { kind: 'present' as const, subject: toSubject(argument, scope) }
        : code;
    })
    .with({ op: 'rcall' }, (call) => buildMethodView(call.args, scope) ?? code)
    .otherwise(() => code);
}

type CompareNode = Extract<ASTNode, { op: '==' | '!=' | '<' | '<=' | '>' | '>=' }>;

const compareOps: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>=']);

function isCompareNode(node: ASTNode): node is CompareNode {
  return compareOps.has(node.op);
}

const flipped: Readonly<Record<CompareOp, CompareOp>> = {
  '==': '==',
  '!=': '!=',
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
};

function buildCompareView(node: CompareNode, scope: Scope): ConditionView | null {
  const op = node.op;
  const [left, right] = node.args;
  const size = toSizeSubject(left);
  const rightLiteral = toLiteral(right);

  if (size !== null && typeof rightLiteral === 'number') {
    return { kind: 'size', subject: toSubject(size, scope), op, value: rightLiteral };
  }

  if (rightLiteral !== null) {
    return { kind: 'compare', subject: toSubject(left, scope), op, value: rightLiteral };
  }

  const leftLiteral = toLiteral(left);

  return leftLiteral === null
    ? null
    : { kind: 'compare', subject: toSubject(right, scope), op: flipped[op], value: leftLiteral };
}

function toSizeSubject(node: ASTNode): ASTNode | null {
  if (node.op === 'call' && node.args[0] === 'size' && node.args[1].length === 1) {
    return node.args[1][0] ?? null;
  }

  return node.op === 'rcall' && node.args[0] === 'size' && node.args[2].length === 0
    ? node.args[1]
    : null;
}

function toLiteral(node: ASTNode): Literal | null {
  return match(node)
    .with({ op: 'value' }, (literal) => toScalar(literal.args, false))
    .with({ op: '-_' }, (minus) =>
      minus.args.op === 'value' ? toScalar(minus.args.args, true) : null,
    )
    .with({ op: 'list' }, (list) => {
      const elements = list.args.map((element) => toLiteral(element));

      return elements.every((element) => element !== null) ? elements : null;
    })
    .otherwise(() => null);
}

function toScalar(value: unknown, isNegative: boolean): string | number | boolean | null {
  if (typeof value === 'bigint' || typeof value === 'number') {
    return isNegative ? -Number(value) : Number(value);
  }

  return !isNegative && (typeof value === 'string' || typeof value === 'boolean') ? value : null;
}

function toSubject(node: ASTNode, scope: Scope): Subject {
  const code: Subject = { kind: 'code', source: serialize(node) };

  return match(node)
    .with({ op: 'id' }, (id) =>
      id.args === scope
        ? ({ kind: 'item' } as const)
        : ({ kind: 'variable', name: id.args, path: [] } as const),
    )
    .with({ op: '.' }, (select) =>
      extendPath(toSubject(select.args[0], scope), select.args[1], code),
    )
    .with({ op: '[]' }, (index) => {
      const [, key] = index.args;

      return key.op === 'value' && typeof key.args === 'string'
        ? extendPath(toSubject(index.args[0], scope), key.args, code)
        : code;
    })
    .with({ op: 'rcall' }, (call) => toTimeSubject(call.args) ?? code)
    .otherwise(() => code);
}

function extendPath(base: Subject, field: string, fallback: Subject): Subject {
  return base.kind === 'variable' ? { ...base, path: [...base.path, field] } : fallback;
}

function toTimeSubject(args: readonly [string, ASTNode, ASTNode[]]): Subject | null {
  const [name, target, params] = args;
  const part = timeMethods[name];
  const [zone] = params;

  return part !== undefined &&
    target.op === 'id' &&
    target.args === 'now' &&
    zone?.op === 'value' &&
    typeof zone.args === 'string'
    ? { kind: 'time', part, zone: zone.args }
    : null;
}

function isSelectNode(node: ASTNode): boolean {
  return node.op === '.' || node.op === '[]';
}

function buildMethodView(
  args: readonly [string, ASTNode, ASTNode[]],
  scope: Scope,
): ConditionView | null {
  const [name, target, params] = args;
  const [argument, predicate] = params;

  if (isTextOp(name) && argument?.op === 'value' && typeof argument.args === 'string') {
    return {
      kind: 'text',
      subject: toSubject(target, scope),
      op: name,
      value: argument.args,
    };
  }

  const variable = argument?.op === 'id' ? argument.args : null;

  if ((name === 'all' || name === 'exists') && variable !== null && predicate !== undefined) {
    return {
      kind: name === 'all' ? 'each' : 'some',
      list: toSubject(target, scope),
      part: buildConditionView(predicate, variable),
    };
  }

  return null;
}

type TextOp = 'startsWith' | 'endsWith' | 'contains';

function isTextOp(name: string): name is TextOp {
  return name === 'startsWith' || name === 'endsWith' || name === 'contains';
}
