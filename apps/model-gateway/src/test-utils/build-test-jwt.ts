// An unsigned JWT built from claims at run time, so no test commits a token.
export function buildTestJWT(claims: Readonly<Record<string, unknown>>): string {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
