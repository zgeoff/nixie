import { z } from 'zod';

// Every config key that names a credential takes this one form, which accepts each reference the
// older per-key patterns accepted.
export const deploymentReference = z.string().regex(/^deployment:.+$/u, 'use deployment:<name>');
