// The ID is also an imp name, which imp caps at 31 characters.
export function createSandboxID(): string {
  return `nixie-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}
