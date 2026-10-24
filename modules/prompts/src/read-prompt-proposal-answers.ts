import type { Log, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { promptProposalOutcomes } from './prompt-proposal-outcomes';
import { promptsOverrideApprovedCodec } from './prompts-override-approved-codec';
import { promptsOverrideExportedCodec } from './prompts-override-exported-codec';
import { readPromptProposals } from './read-prompt-proposals';
import type { PromptProposalAnswerEvent, PromptProposalStep } from './types';

export interface PromptAnswerRange {
  readonly after: number;
  readonly through: number;
}

export interface NotedPromptAnswer {
  readonly sequence: number;
  readonly at: number;
  readonly detail: PromptProposalAnswerEvent;
}

const closingPayload = z.object({ proposalID: z.string() });

const answerSteps: ReadonlyMap<RecordKind, PromptProposalStep> = new Map([
  ...promptProposalOutcomes,
  ['prompts.override_exported', 'exported'],
]);

export async function readPromptProposalAnswers(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
  range: PromptAnswerRange,
): Promise<readonly NotedPromptAnswer[]> {
  const records = await readAnswerRecords(log, thread, range);

  const proposals = await readPromptProposals(
    log.writer.db,
    records.map((entry) => closingPayload.parse(entry.record.payload).proposalID),
  );

  const promptIDs = new Map(
    proposals.map((state) => [state.proposal.proposalID, state.proposal.promptID]),
  );

  return records.flatMap((entry) => {
    const record = entry.record;
    const proposalID = closingPayload.parse(record.payload).proposalID;
    const promptID = promptIDs.get(proposalID);
    const step = answerSteps.get(record.kind);

    invariant(step, 'the answer read takes only the kinds that map to a step');

    if (promptID === undefined) {
      return [];
    }

    const reason =
      record.erasable.status === 'readable' ? record.erasable.fields['reason'] : undefined;

    const approval =
      record.kind === 'prompts.override_approved'
        ? promptsOverrideApprovedCodec.decode(record.payload)
        : null;

    const exported =
      record.kind === 'prompts.override_exported'
        ? promptsOverrideExportedCodec.decode(record.payload)
        : null;

    return [
      {
        sequence: record.sequence,
        at: record.recordedAt.getTime(),
        detail: {
          proposalID,
          promptID,
          step,
          isEdited: approval?.isEdited ?? false,
          pullRequestURL: exported?.pullRequestURL ?? null,
          reason: typeof reason === 'string' ? reason : null,
        },
      },
    ];
  });
}

type AnswerRecords = Awaited<ReturnType<typeof readRecords>>;

const readLimit = 1000;

async function readAnswerRecords(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
  range: PromptAnswerRange,
): Promise<AnswerRecords> {
  const page = await readRecords(log, {
    afterSequence: range.after,
    beforeSequence: range.through + 1,
    thread,
    kinds: [...answerSteps.keys()],
    limit: readLimit,
  });

  const last = page.at(-1);

  if (page.length < readLimit || last === undefined) {
    return page;
  }

  const rest = await readAnswerRecords(log, thread, {
    after: last.record.sequence,
    through: range.through,
  });

  return [...page, ...rest];
}
