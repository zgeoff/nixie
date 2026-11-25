// A pattern for a text over the bytes read as latin1.
export function buildLiteralPattern(form: string): RegExp {
  const latin1 = Buffer.from(form, 'utf8').toString('latin1');

  return new RegExp(latin1.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`), 'gu');
}
