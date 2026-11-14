import { buildShortIDFromUUID } from '@heynixie/db';
import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { z } from 'zod';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

const declinedSchema = z.object({ proposalID: z.string() });

// The owner's decline of a memory or skill proposal that the task's own call asked for. A skill
// proposal's ID is already the short one the model knows it by.
export function renderProposalDecline(record: LogRecord, times: MessageTimeOptions): string {
  const proposalID = declinedSchema.parse(record.payload).proposalID;
  const kind: string = record.kind;
  const isMemory = kind === 'memory.proposal_rejected';
  const shortID = isMemory ? buildShortIDFromUUID(proposalID) : proposalID;
  const note = pickNote(record);

  return renderSystemMessage({
    type: 'approval',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${String(record.sequence)}] Declined the ${isMemory ? 'memory' : 'skill'} proposal \`${shortID}\`.${note === null ? '' : ` ${note}`}`,
  });
}

function pickNote(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const reason = record.erasable.fields['reason'];

  return typeof reason === 'string' && reason !== '' ? reason : null;
}
