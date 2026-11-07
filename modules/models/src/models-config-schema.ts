import { agentSDKProfileSchema } from './agent-sdk-profile-schema';
import { buildModelsConfigSchema } from './build-models-config-schema';

// A harness's profile schema goes in this tuple, because zod builds a union only from a tuple.
export const modelsConfigSchema = buildModelsConfigSchema([agentSDKProfileSchema]);
