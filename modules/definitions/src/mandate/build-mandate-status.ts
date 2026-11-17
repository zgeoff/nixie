import { formatMessageTime } from '@heynixie/sessions';
import type { SessionFacts, StatusEntry } from '@heynixie/sessions';
import type { ActiveMandate } from './read-active-mandates';

export interface MandateStatusReads {
  readonly readActive: () => Promise<readonly ActiveMandate[]>;
  readonly readTitles: (
    mandateIDs: readonly string[],
  ) => Promise<ReadonlyMap<string, string | null>>;
}

// The recorded value is the count, so the session-opened record holds no free text.
export function buildMandateStatus(reads: MandateStatusReads): StatusEntry {
  return {
    name: 'active_mandates',
    read: async (facts) => {
      // A mandate that expired since the last sweep is still in force in storage, but is over.
      const stored = await reads.readActive();

      const active = stored.filter((mandate) => mandate.expires > facts.openedAt.getTime());

      if (active.length === 0) {
        return { value: 0, text: 'Active mandates: none.' };
      }

      const titles = await reads.readTitles(active.map((mandate) => mandate.mandateID));

      const lines = active.map((mandate) =>
        formatMandateLine(mandate, titles.get(mandate.mandateID) ?? null, facts),
      );

      return {
        value: active.length,
        text: [`Active mandates: ${active.length}.`, ...lines].join('\n'),
      };
    },
  };
}

function formatMandateLine(
  mandate: ActiveMandate,
  title: string | null,
  facts: SessionFacts,
): string {
  const end = formatMessageTime(new Date(mandate.expires), facts.zone, facts.times);
  const sentences = mandate.rules.map((rule) => rule.sentence).join(' ');

  return `  ${title ?? 'untitled'} (mandate ${mandate.mandateID}), ends ${end}: ${sentences}`;
}
