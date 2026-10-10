// A new random sandbox ID: nixie- and 24 hex digits, which also fits imp's 31-character names.
export function createSandboxID(): string {
  return `nixie-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}
