import type { ConsolidationDiff } from '@heynixie/memory';
import { z } from 'zod';
import { parseControlBody } from './parse-control-body';
import type { HostMemory } from './require-host-memory';
import { requireHostMemory } from './require-host-memory';

type ReadMemory = () => HostMemory | null;

// Shows the consolidator's pending diff, and answers its changes under the action hashes the host
// command showed: an approval of one change, of several, or of the whole diff, each change its own
// approval record, or a rejection of one change.
export function buildConsolidationRoutes(readMemory: ReadMemory) {
  return {
    '/memory/consolidation': {
      GET: async () => {
        const diff = await requireHostMemory(readMemory).consolidations.readPending();

        const entry = diff === null ? null : buildDiffEntry(diff);

        return Response.json(entry);
      },
    },
    '/memory/consolidation/approve': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const body = await parseControlBody(request, approveBody, approveUsage);

        const answers = body.answers.map((answer) => ({
          changeID: answer.changeID,
          actionHash: answer.actionHash,
          identityID: hostIdentityID,
        }));

        const outcomes = await requireHostMemory(readMemory).consolidations.approveAll(answers);

        return Response.json({ outcomes });
      },
    },
    '/memory/consolidation/reject': {
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
      POST: async (request: Request) => {
        const answer = await parseControlBody(request, changeAnswer, rejectUsage);

        await requireHostMemory(readMemory).consolidations.reject({
          ...answer,
          identityID: hostIdentityID,
        });

        return Response.json({ changeID: answer.changeID });
      },
    },
  } as const;
}

// An answer through the socket comes from a shell in nixie's container, which no device session
// reaches, so its approval record names the host as the identity that answered.
const hostIdentityID = 'host';

// What a host command shows of the diff: each change with its inputs at the versions read, its
// new text, reason, answer hash, comment and short ID, and the summary the consolidator left for
// you, which a run with no change shows on its own.
function buildDiffEntry(diff: ConsolidationDiff) {
  return {
    diffID: diff.diffID,
    model: diff.model,
    createdAt: new Date(diff.createdAt).toISOString(),
    changes: diff.changes.map((change) => ({
      changeID: change.changeID,
      shortID: change.shortID,
      kind: change.kind,
      inputs: change.inputs,
      text: change.text,
      reason: change.reason,
      source: change.source,
      actionHash: change.actionHash,
      lapseAt: new Date(change.lapseAt).toISOString(),
      comment:
        change.comment === null
          ? null
          : { text: change.comment.text, at: new Date(change.comment.at).toISOString() },
    })),
    summary: diff.summary?.text ?? null,
  };
}

const changeAnswer = z.strictObject({
  changeID: z.string().min(1),
  actionHash: z.string().min(1),
});

const approveBody = z.strictObject({ answers: z.array(changeAnswer).min(1).max(30) });
const approveUsage = 'an approval takes answers: 1 to 30 of { changeID, actionHash }';
const rejectUsage = 'a rejection takes a changeID and an actionHash';
