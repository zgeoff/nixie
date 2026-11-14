import { impConfigSchema } from '@heynixie/sandbox-imp';
import { sandboxConfigSchema } from './sandbox-config-schema';

export const sandboxSections = {
  sandbox: sandboxConfigSchema.default(sandboxConfigSchema.parse({})),
  imp: impConfigSchema.optional(),
};
