import { featureIDs } from '@heynixie/contract';
import { Collection } from '@msw/data';
import { z } from 'zod';

// The features that this mock nixie has off. A feature is on until a row here says it is off.
const featuresOff = new Collection({
  schema: z.object({ feature: z.enum(featureIDs) }),
});

export const featureStore = {
  featuresOff,
  reset: (): void => {
    featuresOff.clear();
  },
};
