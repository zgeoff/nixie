import { checkPromptProposal } from '@heynixie/definitions';
import { ORPCError, os } from '@orpc/server';
import { createHostActionProcedures } from './create-host-action-procedures';
import { createHostConsolidationProcedures } from './create-host-consolidation-procedures';
import { createHostContactProcedures } from './create-host-contact-procedures';
import { createHostItemProcedures } from './create-host-item-procedures';
import { createHostPromptProposalProcedures } from './create-host-prompt-proposal-procedures';
import { createHostProposalProcedures } from './create-host-proposal-procedures';
import { createHostRuleProcedures } from './create-host-rule-procedures';
import { createHostSessionProcedures } from './create-host-session-procedures';
import { createHostSkillProposalProcedures } from './create-host-skill-proposal-procedures';
import { createHostSubjectsProcedure } from './create-host-subjects-procedure';
import { createHostTaskProcedures } from './create-host-task-procedures';
import { createHostWrittenSkillProcedures } from './create-host-written-skill-procedures';
import { hostImplementer } from './host-implementer';
import type { HostRouterOptions } from './types';

export function createHostRouter(options: HostRouterOptions) {
  const skillContext = { ...options.context, seedWrittenSkills: options.runInForceSeed };

  const promptContext = {
    ...options.context,
    readInForce: options.readInForce,
    checkProposal: checkPromptProposal,
    wakeExports: options.wakeExports,
  };

  const gated = os.middleware((middleware) =>
    options.gate.runCall(
      () => Promise.resolve(middleware.next()),
      () => Promise.reject(new ORPCError('SERVICE_UNAVAILABLE', { message: 'nixie is resetting' })),
    ),
  );

  return hostImplementer.router({
    reset: hostImplementer.reset.handler(() => options.runReset()),
    resetConversations: hostImplementer.resetConversations.handler(() =>
      options.runConversationReset(),
    ),
    tasks: hostImplementer.tasks.use(gated).router(createHostTaskProcedures(options.context)),
    sessions: hostImplementer.sessions
      .use(gated)
      .router(createHostSessionProcedures(options.context)),
    memory: hostImplementer.memory.use(gated).router({
      proposals: createHostProposalProcedures(options.readMemory),
      items: createHostItemProcedures(options.context, options.readMemory),
      consolidation: createHostConsolidationProcedures(options.readMemory),
      subjects: createHostSubjectsProcedure(options.readMemory),
    }),
    skills: hostImplementer.skills.use(gated).router({
      proposals: createHostSkillProposalProcedures(skillContext),
      written: createHostWrittenSkillProcedures(skillContext),
    }),
    rules: hostImplementer.rules
      .use(gated)
      .router(
        createHostRuleProcedures({ ...options.context, runInForceSeed: options.runInForceSeed }),
      ),
    actions: hostImplementer.actions.use(gated).router(createHostActionProcedures(options.context)),
    contacts: hostImplementer.contacts
      .use(gated)
      .router(
        createHostContactProcedures({ ...options.context, runInForceSeed: options.runInForceSeed }),
      ),
    prompts: hostImplementer.prompts.use(gated).router({
      proposals: createHostPromptProposalProcedures(promptContext),
    }),
  });
}
