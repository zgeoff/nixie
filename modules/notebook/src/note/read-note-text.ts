import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

export interface NoteText {
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
}

// The title, body and tags that the record at this sequence holds, or null once the key is gone.
export async function readNoteText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
): Promise<NoteText | null> {
  const [entry] = await readRecords(log, {
    afterSequence: sequence - 1,
    beforeSequence: sequence + 1,
    limit: 1,
  });

  const erasable = entry?.record.erasable;

  if (erasable?.status !== 'readable') {
    return null;
  }

  const fields = erasable.fields;
  const title = fields['title'];
  const body = fields['body'];
  const tags = fields['tags'];

  if (typeof title !== 'string' || typeof body !== 'string' || !Array.isArray(tags)) {
    return null;
  }

  return { title, body, tags: tags.filter((tag) => typeof tag === 'string') };
}
