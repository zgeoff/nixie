import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { z } from 'zod';
import { readSkillProposals } from './read-skill-proposals';
import { skillProposalLapseMs } from './skill-proposal-lapse-ms';
import { skillProposalOutcomes } from './skill-proposal-outcomes';
import { skillsWriteApprovedCodec } from './skills-write-approved-codec';
import type { SkillProposalOutcome } from './types';

// How a skill proposal on the thread closed: your approval with its pull request, your rejection
// with its reason, or its lapse.
export interface SkillProposalAnswerEvent {
  readonly proposalID: string;
  readonly name: string;
  readonly outcome: SkillProposalOutcome;

  // the pull request an approval opened on your definitions, or null for any other outcome
  readonly pullRequestURL: string | null;

  // the reason you gave a rejection, or null for any other outcome or when its key is gone
  readonly reason: string | null;
}

// the most answers one note reads, past which the block's count of more stops growing
const readLimit = 1000;
const lapseDays = skillProposalLapseMs / (24 * 60 * 60 * 1000);

// every record that closes a proposal names it in its payload
const closingPayload = z.object({ proposalID: z.string() });

// The event kind for the close of each skill proposal on the thread, read from the record that
// closed it, so the turn after a rejection reads your reason.
export function buildSkillProposalAnswerKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
): EventKind<SkillProposalAnswerEvent> {
  return {
    name: 'skill_proposal_answer',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        thread,
        kinds: [...skillProposalOutcomes.keys()],
        limit: readLimit,
      });

      const proposals = await readSkillProposals(
        log.writer.db,
        records.map((entry) => closingPayload.parse(entry.record.payload).proposalID),
      );

      const names = new Map(
        proposals.map((state) => [state.proposal.proposalID, state.proposal.name]),
      );

      return records.flatMap((entry) => {
        const record = entry.record;
        const proposalID = closingPayload.parse(record.payload).proposalID;
        const name = names.get(proposalID);
        const outcome = skillProposalOutcomes.get(record.kind);

        if (name === undefined || outcome === undefined) {
          return [];
        }

        const reason =
          record.erasable.status === 'readable' ? record.erasable.fields['reason'] : undefined;

        return [
          {
            sequence: record.sequence,
            at: record.recordedAt.getTime(),
            detail: {
              proposalID,
              name,
              outcome,
              pullRequestURL:
                record.kind === 'skills.write_approved'
                  ? skillsWriteApprovedCodec.decode(record.payload).pullRequestURL
                  : null,
              reason: typeof reason === 'string' ? reason : null,
            },
          },
        ];
      });
    },
    render: (detail, settings) => {
      const owner = settings.ownerName ?? 'The owner';
      const proposal = `your skill proposal ${detail.proposalID} (${detail.name})`;

      if (detail.outcome === 'lapsed') {
        return (
          `Your skill proposal ${detail.proposalID} (${detail.name}) lapsed after ${lapseDays} ` +
          'days with no answer.'
        );
      }

      if (detail.outcome === 'approved') {
        const pullRequest = detail.pullRequestURL ?? 'a pull request';

        return (
          `${owner} approved ${proposal} and opened ${pullRequest} with it. The skill joins ` +
          'your definitions once that pull request merges.'
        );
      }

      const line = `${owner} rejected ${proposal}.`;

      return detail.reason === null ? line : `${line} Reason: "${detail.reason}".`;
    },
  };
}
