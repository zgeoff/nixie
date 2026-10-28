import type { z } from 'zod';

// The function runs in the page, so it sees only its argument and the page's globals, and its
// result crosses back as JSON.
export async function runInPage<A, S extends z.ZodType>(
  view: Bun.WebView,
  fn: (arg: A) => z.input<S> | Promise<z.input<S>>,
  arg: A,
  result: S,
): Promise<z.output<S>> {
  const value: unknown = await view.evaluate(`(${fn.toString()})(${JSON.stringify(arg)})`);

  return result.parse(value);
}
