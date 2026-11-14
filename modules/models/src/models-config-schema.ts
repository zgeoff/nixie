import { harnesses } from './bind-harness';
import { buildModelsConfigSchema } from './build-models-config-schema';

const [first, ...rest] = harnesses;

// zod builds a union only from a tuple, so the first definition leads it.
export const modelsConfigSchema = buildModelsConfigSchema([
  first.profileSchema,
  ...rest.map((definition) => definition.profileSchema),
]);
