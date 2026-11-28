import { checkPromptProposal } from '@heynixie/definitions';
import { ORPCError, os } from '@orpc/server';
import type { HostRouterOptions } from '../types';
import { createHostActionProcedures } from './create-host-action-procedures';
import { createHostBackupProcedures } from './create-host-backup-procedures';
import { createHostBudgetProcedures } from './create-host-budget-procedures';
import { createHostContactProcedures } from './create-host-contact-procedures';
import { createHostDefinitionProcedures } from './create-host-definition-procedures';
import { createHostItemProcedures } from './create-host-item-procedures';
import { createHostLogProcedures } from './create-host-log-procedures';
import { createHostMandateProcedures } from './create-host-mandate-procedures';
import { createHostMcpProcedures } from './create-host-mcp-procedures';
import { createHostNixieProcedures } from './create-host-nixie-procedures';
import { createHostPasskeyProcedures } from './create-host-passkey-procedures';
import { createHostPromptProposalProcedures } from './create-host-prompt-proposal-procedures';
import { createHostProposalProcedures } from './create-host-proposal-procedures';
import { createHostRecoveryProcedures } from './create-host-recovery-procedures';
import { createHostRuleProcedures } from './create-host-rule-procedures';
import { createHostSessionProcedures } from './create-host-session-procedures';
import { createHostSkillProposalProcedures } from './create-host-skill-proposal-procedures';
import { createHostSpendProcedures } from './create-host-spend-procedures';
import { createHostSubjectsProcedure } from './create-host-subjects-procedure';
import { createHostTaskProcedures } from './create-host-task-procedures';
import { createHostTurnInputProcedures } from './create-host-turn-input-procedures';
import { createHostWrittenSkillProcedures } from './create-host-written-skill-procedures';
import { hostImplementer } from './host-implementer';

export function createHostRouter(options: HostRouterOptions) {
  const skillContext = { ...options.context, runInForceSeed: options.runInForceSeed };

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
    nixie: hostImplementer.nixie.use(gated).router(createHostNixieProcedures(options.context)),
    spend: hostImplementer.spend.use(gated).router(createHostSpendProcedures(options.context)),
    recovery: hostImplementer.recovery
      .use(gated)
      .router(createHostRecoveryProcedures(options.context)),
    backups: hostImplementer.backups
      .use(gated)
      .router(createHostBackupProcedures(options.readBackups)),
    log: hostImplementer.log
      .use(gated)
      .router(createHostLogProcedures(options.context, options.decide)),
    tasks: hostImplementer.tasks.use(gated).router(createHostTaskProcedures(options.context)),
    sessions: hostImplementer.sessions
      .use(gated)
      .router(createHostSessionProcedures(options.context)),
    passkeys: hostImplementer.passkeys
      .use(gated)
      .router(createHostPasskeyProcedures(options.context)),
    memory: hostImplementer.memory.use(gated).router({
      proposals: createHostProposalProcedures(options.readMemory),
      items: createHostItemProcedures(options.context, options.readMemory),
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
    mandates: hostImplementer.mandates
      .use(gated)
      .router(
        createHostMandateProcedures({ ...options.context, runInForceSeed: options.runInForceSeed }),
      ),
    mcp: hostImplementer.mcp.use(gated).router(createHostMcpProcedures(options.context)),
    budgets: hostImplementer.budgets.use(gated).router(createHostBudgetProcedures(options.context)),
    definitions: hostImplementer.definitions
      .use(gated)
      .router(createHostDefinitionProcedures(options.readDefinitions)),
    actions: hostImplementer.actions.use(gated).router(createHostActionProcedures(options.context)),
    contacts: hostImplementer.contacts
      .use(gated)
      .router(
        createHostContactProcedures({ ...options.context, runInForceSeed: options.runInForceSeed }),
      ),
    turnInputs: hostImplementer.turnInputs
      .use(gated)
      .router(createHostTurnInputProcedures(options.turnInputs)),
    prompts: hostImplementer.prompts.use(gated).router({
      proposals: createHostPromptProposalProcedures(promptContext),
    }),
  });
}
