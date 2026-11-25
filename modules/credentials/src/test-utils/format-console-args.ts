import { match } from 'ts-pattern';

// Formats the arguments of a console call as Bun's console prints them. `node:util` format differs:
// under `%s` it inspects an array, where Bun's console joins it, so a value split across an array
// and a string prints whole only in Bun's form.
export function formatConsoleArgs(args: readonly unknown[]): string {
  const [first, ...rest] = args;

  if (typeof first !== 'string') {
    return args.map((arg) => formatRest(arg)).join(' ');
  }

  const remaining = [...rest];

  const head = first.replaceAll(/%(?<kind>[sdifoOjc%])/gu, (token: string, kind: string) => {
    if (kind === '%') {
      return '%';
    }

    if (remaining.length === 0) {
      return token;
    }

    return formatDirective(kind, remaining.shift());
  });

  return [head, ...remaining.map((arg) => formatRest(arg))].join(' ');
}

function formatRest(arg: unknown): string {
  return typeof arg === 'string' ? arg : Bun.inspect(arg);
}

function formatDirective(kind: string, arg: unknown): string {
  return match(kind)
    .with('s', () => String(arg))
    .with('d', 'i', () => String(Math.trunc(Number(arg))))
    .with('f', () => String(Number(arg)))
    .with('j', () => JSON.stringify(arg))
    .with('c', () => '')
    .otherwise(() => Bun.inspect(arg));
}
