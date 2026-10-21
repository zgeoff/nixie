import { compactionConfigSchema } from '@heynixie/compaction';
import { modelsConfigSchema } from '@heynixie/models';
import { agentConfigSchema } from '@heynixie/sessions';

export const modelSections = {
  agent: agentConfigSchema.default(agentConfigSchema.parse({})),
  models: modelsConfigSchema,
  compaction: compactionConfigSchema.default(compactionConfigSchema.parse({})),
};
