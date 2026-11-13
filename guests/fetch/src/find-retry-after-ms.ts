const retryAfterStatuses: ReadonlySet<number> = new Set([429, 503, 403]);

export function findRetryAfterMs(
  status: number,
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  nowMs: number,
): number | null {
  const waits = [
    retryAfterStatuses.has(status)
      ? findRetryAfterWait(pickFirst(headers['retry-after']), nowMs)
      : null,
    findResetWait(headers, nowMs),
  ].filter((wait): wait is number => wait !== null && Number.isSafeInteger(wait));

  return waits.length === 0 ? null : Math.max(...waits);
}

const httpDate = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/u;

function findRetryAfterWait(value: string | undefined, nowMs: number): number | null {
  if (value === undefined) {
    return null;
  }

  if (/^\d+$/u.test(value)) {
    return Number(value) * 1000;
  }

  if (!httpDate.test(value)) {
    return null;
  }

  const date = Date.parse(value);

  return Number.isNaN(date) ? null : Math.max(0, Math.ceil(date - nowMs));
}

function pickFirst(value: string | readonly string[] | undefined): string | undefined {
  return (typeof value === 'string' ? value : value?.[0])?.trim();
}

function findResetWait(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  nowMs: number,
): number | null {
  const reset = pickFirst(headers['x-ratelimit-reset']);

  if (pickFirst(headers['x-ratelimit-remaining']) !== '0' || reset === undefined) {
    return null;
  }

  if (!/^\d+(?:\.\d+)?$/u.test(reset)) {
    return null;
  }

  return Math.max(0, Math.ceil(Number(reset) * 1000 - nowMs));
}
