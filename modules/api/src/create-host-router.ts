import { createHostConsolidationProcedures } from './create-host-consolidation-procedures';
import { createHostItemProcedures } from './create-host-item-procedures';
import { createHostProposalProcedures } from './create-host-proposal-procedures';
import { createHostSessionProcedures } from './create-host-session-procedures';
import { createHostSkillProposalProcedures } from './create-host-skill-proposal-procedures';
import { createHostSubjectsProcedure } from './create-host-subjects-procedure';
import { hostImplementer } from './host-implementer';
import type { HostRouterOptions } from './types';

// Builds the router of the host contract, which the control socket serves to the host commands.
export function createHostRouter(options: HostRouterOptions) {
  return hostImplementer.router({
    reset: hostImplementer.reset.handler(() => options.runReset()),
    sessions: createHostSessionProcedures(options.context),
    memory: {
      proposals: createHostProposalProcedures(options.readMemory),
      items: createHostItemProcedures(options.readMemory),
      consolidation: createHostConsolidationProcedures(options.readMemory),
      subjects: createHostSubjectsProcedure(options.readMemory),
    },
    skills: {
      proposals: createHostSkillProposalProcedures({
        ...options.context,
        seedWrittenSkills: options.seedWrittenSkills,
      }),
    },
  });
}
