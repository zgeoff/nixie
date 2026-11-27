import type { ASTNode } from '@marcbachmann/cel-js';
import { match } from 'ts-pattern';
import type { TimePart } from './types';

// The library can't drop a built-in from an environment, so this walk is the only gate on the
// subset. It returns the first construct outside the subset, or null.
export function pickRefusedConstruct(node: ASTNode, isInMacro = false): string | null {
  return match(node)
    .with({ op: 'value' }, (literal) => pickRefusedLiteral(literal.args))
    .with({ op: 'id' }, () => null)
    .with({ op: '.' }, (select) => pickRefusedConstruct(select.args[0], isInMacro))
    .with({ op: '[]' }, (index) => pickFirstRefusal(index.args, isInMacro))
    .with({ op: 'list' }, (list) =>
      list.args.every((element) => isLiteralNode(element)) ? null : 'a list of non-literals',
    )
    .with({ op: '&&' }, { op: '||' }, (logic) => pickFirstRefusal(logic.args, isInMacro))
    .with({ op: '!_' }, (negation) => pickRefusedConstruct(negation.args, isInMacro))
    .with({ op: '-_' }, (minus) => (isLiteralNode(minus) ? null : 'arithmetic'))
    .with(
      { op: '==' },
      { op: '!=' },
      { op: '<' },
      { op: '<=' },
      { op: '>' },
      { op: '>=' },
      { op: 'in' },
      (comparison) => pickFirstRefusal(comparison.args, isInMacro),
    )
    .with({ op: 'call' }, (call) =>
      call.args[0] === 'size' || call.args[0] === 'has'
        ? pickFirstRefusal(call.args[1], isInMacro)
        : `${call.args[0]}()`,
    )
    .with({ op: 'rcall' }, (call) => pickRefusedMethod(call.args, isInMacro))
    .with({ op: '+' }, { op: '-' }, { op: '*' }, { op: '/' }, { op: '%' }, () => 'arithmetic')
    .with({ op: '?:' }, () => '?:')
    .with({ op: 'map' }, () => 'a map literal')
    .with({ op: '.?' }, { op: '[?]' }, () => 'an optional type')
    .exhaustive();
}

function pickRefusedLiteral(value: unknown): string | null {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'object') {
    return value instanceof Uint8Array ? 'bytes' : 'uint';
  }

  return null;
}

function pickFirstRefusal(nodes: readonly ASTNode[], isInMacro: boolean): string | null {
  for (const node of nodes) {
    const refused = pickRefusedConstruct(node, isInMacro);

    if (refused !== null) {
      return refused;
    }
  }

  return null;
}

// A literal is a bool, an int, a double or a string, a negative number, or a list of them
function isLiteralNode(node: ASTNode): boolean {
  return match(node)
    .with({ op: 'value' }, (literal) => pickRefusedLiteral(literal.args) === null)
    .with(
      { op: '-_' },
      (minus) =>
        minus.args.op === 'value' &&
        (typeof minus.args.args === 'bigint' || typeof minus.args.args === 'number'),
    )
    .with({ op: 'list' }, (list) => list.args.every((element) => isLiteralNode(element)))
    .otherwise(() => false);
}

type MethodArgs = readonly [string, ASTNode, ASTNode[]];

const textMethods: ReadonlySet<string> = new Set([
  'startsWith',
  'endsWith',
  'contains',
  'lowerAscii',
]);

export const timeMethods: Readonly<Record<string, TimePart>> = {
  getHours: 'hour',
  getMinutes: 'minute',
  getDayOfWeek: 'weekday',
  getDate: 'day',
  getMonth: 'month',
  getFullYear: 'year',
};

function pickRefusedMethod(args: MethodArgs, isInMacro: boolean): string | null {
  const [name, target, params] = args;

  if (name === 'exists' || name === 'all') {
    return isInMacro ? 'a macro inside a macro' : pickRefusedMacro(target, params);
  }

  if (name === 'size' || textMethods.has(name)) {
    return pickFirstRefusal([target, ...params], isInMacro);
  }

  if (name in timeMethods) {
    return pickRefusedTimeMethod(name, target, params, isInMacro);
  }

  return `${name}()`;
}

function pickRefusedMacro(target: ASTNode, params: readonly ASTNode[]): string | null {
  const [, predicate] = params;

  return (
    pickRefusedConstruct(target, false) ??
    (predicate ? pickRefusedConstruct(predicate, true) : null)
  );
}

function pickRefusedTimeMethod(
  name: string,
  target: ASTNode,
  params: readonly ASTNode[],
  isInMacro: boolean,
): string | null {
  const [zone] = params;

  if (params.length !== 1 || zone?.op !== 'value' || typeof zone.args !== 'string') {
    return `${name}() without a zone string`;
  }

  return isZoneKnown(zone.args)
    ? pickRefusedConstruct(target, isInMacro)
    : `${name}() with an unknown zone`;
}

function isZoneKnown(zone: string): boolean {
  try {
    const format = new Intl.DateTimeFormat('en-US', { timeZone: zone });

    return format.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}
