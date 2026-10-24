import { createHostConsolidationProcedures } from './create-host-consolidation-procedures';
import { createHostItemProcedures } from './create-host-item-procedures';
import { createHostProposalProcedures } from './create-host-proposal-procedures';
import { createHostSessionProcedures } from './create-host-session-procedures';
import { createHostSkillProposalProcedures } from './create-host-skill-proposal-procedures';
import { createHostSubjectsProcedure } from './create-host-subjects-procedure';
import { createHostWrittenSkillProcedures } from './create-host-written-skill-procedures';
import { hostImplementer } from './host-implementer';
import type { HostRouterOptions } from './types';

export function createHostRouter(options: HostRouterOptions) {
  const skillContext = { ...options.context, seedWrittenSkills: options.seedWrittenSkills };

  return hostImplementer.router({
    reset: hostImplementer.reset.handler(() => options.runReset()),
    resetConversations: hostImplementer.resetConversations.handler(() =>
      options.runConversationReset(),
    ),
    sessions: createHostSessionProcedures(options.context),
    memory: {
      proposals: createHostProposalProcedures(options.readMemory),
      items: createHostItemProcedures(options.readMemory),
      consolidation: createHostConsolidationProcedures(options.readMemory),
      subjects: createHostSubjectsProcedure(options.readMemory),
    },
    skills: {
      proposals: createHostSkillProposalProcedures(skillContext),
      written: createHostWrittenSkillProcedures(skillContext),
    },
  });
}
