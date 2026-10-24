import { checkPromptProposal } from '@heynixie/definitions';
import { createHostConsolidationProcedures } from './create-host-consolidation-procedures';
import { createHostItemProcedures } from './create-host-item-procedures';
import { createHostPromptProposalProcedures } from './create-host-prompt-proposal-procedures';
import { createHostProposalProcedures } from './create-host-proposal-procedures';
import { createHostSessionProcedures } from './create-host-session-procedures';
import { createHostSkillProposalProcedures } from './create-host-skill-proposal-procedures';
import { createHostSubjectsProcedure } from './create-host-subjects-procedure';
import { createHostWrittenSkillProcedures } from './create-host-written-skill-procedures';
import { hostImplementer } from './host-implementer';
import type { HostRouterOptions } from './types';

export function createHostRouter(options: HostRouterOptions) {
  const skillContext = { ...options.context, seedWrittenSkills: options.seedWrittenSkills };

  const promptContext = {
    ...options.context,
    readInForce: options.readInForce,
    checkProposal: checkPromptProposal,
    wakeExports: options.wakeExports,
  };

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
      proposals: createHostSkillProposalProcedures(skillContext),
      written: createHostWrittenSkillProcedures(skillContext),
    },
    prompts: { proposals: createHostPromptProposalProcedures(promptContext) },
  });
}
