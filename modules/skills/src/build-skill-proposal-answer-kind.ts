import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { ProposalOutcome } from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import type { EventKind } from '@heynixie/sessions';
import { z } from 'zod';
import { readSkillProposals } from './read-skill-proposals';
import { skillProposalOutcomes } from './skill-proposal-outcomes';
import { skillsWriteApprovedCodec } from './skills-write-approved-codec';

export interface SkillProposalAnswerEvent {
  readonly proposalID: string;
  readonly name: string;
  readonly outcome: ProposalOutcome;

  readonly isEdited: boolean;

  readonly pullRequestURL: string | null;

  readonly reason: string | null;
}

const readLimit = 1000;
const lapseDays = proposalLapseMs / (24 * 60 * 60 * 1000);
const closingPayload = z.object({ proposalID: z.string() });

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

        const approval =
          record.kind === 'skills.write_approved'
            ? skillsWriteApprovedCodec.decode(record.payload)
            : null;

        return [
          {
            sequence: record.sequence,
            at: record.recordedAt.getTime(),
            detail: {
              proposalID,
              name,
              outcome,
              isEdited: approval?.isEdited ?? false,
              pullRequestURL: approval?.pullRequestURL ?? null,
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

      if (detail.outcome === 'approved' && detail.pullRequestURL !== null) {
        return (
          `${owner} approved ${proposal} and opened ${detail.pullRequestURL} with it. The skill ` +
          'joins your definitions once that pull request merges.'
        );
      }

      if (detail.outcome === 'approved') {
        const edits = detail.isEdited ? ' with edits' : '';

        return (
          `${owner} approved ${proposal}${edits}, and the skill is in force for new tasks. ` +
          `Call skill_reload with ${detail.name} to use it in this conversation.`
        );
      }

      const line = `${owner} rejected ${proposal}.`;

      return detail.reason === null ? line : `${line} Reason: "${detail.reason}".`;
    },
  };
}
