import { harnesses } from './bind-harness';
import { buildModelsConfigSchema } from './build-models-config-schema';

export const modelsConfigSchema = buildModelsConfigSchema(harnesses);
