// Why a tool stays stopped when its override names a tool that the server's listing lacks.
export function buildMissingToolFault(name: string): string {
  return `the override names ${name}, which the server does not list`;
}
