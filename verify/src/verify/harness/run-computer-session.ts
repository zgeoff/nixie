import type { ContractClient } from '@heynixie/contract';
import { match } from 'ts-pattern';
import { buildComputerReplies } from './build-computer-replies';
import type { ComputerSessionInput } from './build-computer-replies';
import type { ReplyQueue } from './run-device-show';

// Queues the turn that uses the browser, the shell or the screen, then sends the owner's message.
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
    text: match(session.input.kind)
      .with('browser', () => 'Open the page in your browser.')
      .with('shell', () => 'Write a note on your computer and read it back.')
      .with('screen', () => 'Look at your screen and click the middle of it.')
      .exhaustive(),
    thread: 'conversation',
  });

  return replies.length;
}
