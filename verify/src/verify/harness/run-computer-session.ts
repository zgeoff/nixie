import type { ContractClient } from '@heynixie/contract';
import { buildComputerReplies } from './build-computer-replies';
import type { ComputerSessionInput } from './build-computer-replies';
import type { ReplyQueue } from './run-device-show';

// Queues the turn that uses the browser or the shell, then sends the owner's message.
export interface ComputerSession {
  readonly input: ComputerSessionInput;
  readonly siteURL: string;
}

export async function runComputerSession(
  client: ContractClient,
  model: ReplyQueue,
  session: ComputerSession,
): Promise<number> {
  const replies = buildComputerReplies(session.input, session.siteURL);

  model.addReplies(...replies);

  await client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    images: [],
    spans: [],
    text:
      session.input.kind === 'browser'
        ? 'Open the page in your browser.'
        : 'Write a note on your computer and read it back.',
    thread: 'conversation',
  });

  return replies.length;
}
