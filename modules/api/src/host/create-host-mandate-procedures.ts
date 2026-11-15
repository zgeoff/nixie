// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { RuleContext } from '@heynixie/definitions';
import {
  readActiveMandates,
  readMandateEndReason,
  readMandateTitles,
  runMandateEnd,
} from '@heynixie/definitions';
import { hostImplementer } from './host-implementer';

// The host lists the active mandates and ends one, as the client's End now does.
export function createHostMandateProcedures(context: RuleContext) {
  const mandates = hostImplementer.mandates;

  return {
    list: mandates.list.handler(async () => {
      const active = await readActiveMandates(context.log.writer.db);

      const titles = await readMandateTitles(
        context.log,
        active.map((mandate) => mandate.mandateID),
      );

      return active.map((mandate) => ({
        mandateID: mandate.mandateID,
        title: titles.get(mandate.mandateID) ?? null,
        rules: [...mandate.rules],
        startedAt: new Date(mandate.startedAt),
        expires: new Date(mandate.expires),
      }));
    }),

    end: mandates.end.handler(async (options) => {
      const mandateID = options.input.mandateID;

      const ended = await runMandateEnd(context, mandateID);

      if (ended === 'ended') {
        return { mandateID, state: 'ended' as const };
      }

      const reason = await readMandateEndReason(context.log, mandateID);

      if (reason === null) {
        throw options.errors.NOT_FOUND({ message: 'no mandate has that ID' });
      }

      return { mandateID, state: reason };
    }),
  };
}
