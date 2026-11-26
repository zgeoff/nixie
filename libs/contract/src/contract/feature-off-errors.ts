import { z } from 'zod';
import { featureIDs } from './feature-ids';

// Every procedure of a feature that is off answers this error.
export const featureOffErrors = {
  FEATURE_OFF: {
    message: 'This feature is off in this nixie',
    status: 409,
    data: z.object({ feature: z.enum(featureIDs) }),
  },
} as const;
