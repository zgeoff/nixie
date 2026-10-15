import { modelsConfigSchema } from '@heynixie/models';
import { agentConfigSchema, compactionConfigSchema } from '@heynixie/sessions';

// The sections every model loop reads: the names the user calls the agent by, the profiles and their
// roles, and when nixie compacts a session.
export const modelSections = {
  agent: agentConfigSchema.default(agentConfigSchema.parse({})),
  models: modelsConfigSchema,
  compaction: compactionConfigSchema.default(compactionConfigSchema.parse({})),
};
