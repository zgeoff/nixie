import { store } from '../mocks/store';

export interface SentFileSeed {
  readonly file: string;
  readonly name: string;
  readonly bytes: number;
  readonly mediaType: string;

  // the sequence of the call record, and the result record takes the next one
  readonly sequence: number;
}

// The records of a file.send call and its result, as the conversation reads them.
export async function seedSentFile(seed: SentFileSeed): Promise<void> {
  await store.records.create({
    kind: 'tool_called',
    sequence: seed.sequence,
    toolCall: { callID: seed.file, input: { file: seed.file }, tool: 'file.send' },
  });

  await store.records.create({
    kind: 'tool_result',
    sequence: seed.sequence + 1,
    toolCall: {
      callID: seed.file,
      content: {
        result: {
          file: seed.file,
          name: seed.name,
          bytes: seed.bytes,
          mediaType: seed.mediaType,
        },
      },
      outcome: 'result',
    },
  });
}
