import { impConfigSchema } from '@heynixie/sandbox-imp';
import { sandboxConfigSchema } from './sandbox-config-schema';

// The two sections that pick and configure the sandbox adapter. The imp section is optional because
// the test sandbox never calls impd, and the deployment schema requires it for the imp adapter.
export const sandboxSections = {
  sandbox: sandboxConfigSchema.default(sandboxConfigSchema.parse({})),
  imp: impConfigSchema.optional(),
};
