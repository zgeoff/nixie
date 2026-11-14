import { fileURLToPath } from 'node:url';

export const publicRulesPath = fileURLToPath(
  new URL('../generated/public-rules.generated.ts', import.meta.url),
);
