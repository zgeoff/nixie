import { expect, test } from 'bun:test';
import { deploymentReference } from './deployment-reference';

test.each(['deployment:kagi', 'deployment:example.v2', 'deployment:model_key-1', 'deployment:a b'])(
  'it accepts %s',
  (reference) => {
    expect(deploymentReference.safeParse(reference).success).toBe(true);
  },
);

test.each(['kagi', 'deployment:', 'Deployment:kagi', ' deployment:kagi'])(
  'it refuses %p',
  (reference) => {
    expect(deploymentReference.safeParse(reference).success).toBe(false);
  },
);
