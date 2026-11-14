import { z } from 'zod';

export interface OldRuleRow {
  readonly hash: string;
  readonly form: Record<string, unknown>;
}

// The row the release before wrote for a rule: jobs for definitions, and job for a task context that
// names definitions, beside task for one that does not. A rule with neither has no old row.
export function buildOldRuleRow(form: Record<string, unknown>): OldRuleRow | null {
  const contexts = z.array(z.string()).safeParse(form['contexts']);
  const definitions = form['definitions'];

  if (!(contexts.success && contexts.data.includes('task')) && definitions === undefined) {
    return null;
  }

  const { definitions: _definitions, contexts: _contexts, ...rest } = form;

  const oldContexts = (contexts.success ? contexts.data : []).flatMap((context) => {
    if (context !== 'task') {
      return [context];
    }

    return definitions === undefined ? ['job', 'task'] : ['job'];
  });

  const old = {
    ...rest,
    ...(contexts.success ? { contexts: [...new Set(oldContexts)].toSorted() } : {}),
    ...(definitions === undefined ? {} : { jobs: definitions }),
  };

  const hasher = new Bun.CryptoHasher('sha256');

  hasher.update(toCanonical(old));

  return { hash: hasher.digest('hex'), form: old };
}

export function toCanonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toCanonical(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${toCanonical(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}
