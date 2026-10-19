import { buildHostConsolidationProcedures } from './build-host-consolidation-procedures';
import { buildHostItemProcedures } from './build-host-item-procedures';
import { buildHostProposalProcedures } from './build-host-proposal-procedures';
import { buildHostSessionProcedures } from './build-host-session-procedures';
import { buildHostSubjectsProcedure } from './build-host-subjects-procedure';
import { hostImplementer } from './host-implementer';
import type { HostRouterOptions } from './types';

// Builds the router of the host contract, which the control socket serves to the host commands.
export function buildHostRouter(options: HostRouterOptions) {
  return hostImplementer.router({
    reset: hostImplementer.reset.handler(() => options.runReset()),
    sessions: buildHostSessionProcedures(options.context),
    memory: {
      proposals: buildHostProposalProcedures(options.readMemory),
      items: buildHostItemProcedures(options.readMemory),
      consolidation: buildHostConsolidationProcedures(options.readMemory),
      subjects: buildHostSubjectsProcedure(options.readMemory),
    },
  });
}
