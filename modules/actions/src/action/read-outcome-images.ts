import type { Log, LogRecord } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { ApprovedReply, ToolImage } from '@heynixie/tools';
import { isJSONObject } from './is-json-object';

// The pictures that a connector's result carried: their media types sit in the outcome's fields and
// their bytes are its attachments. A forgotten or unreadable picture is left out.
export async function readOutcomeImages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  outcome: LogRecord,
): Promise<readonly ToolImage[]> {
  const types =
    outcome.erasable.status === 'readable' ? outcome.erasable.fields['imageTypes'] : null;

  if (!Array.isArray(types)) {
    return [];
  }

  const found = await readRecordAttachments(log, [outcome.sequence]);

  const attached = found.get(outcome.sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments : [];

  return types.flatMap((mediaType, index): ToolImage[] => {
    const image = bytes[index];

    return typeof mediaType === 'string' && image !== undefined
      ? [{ mediaType, bytes: image }]
      : [];
  });
}

// What a connector's result shows the model: its result with its pictures, or null when it carried
// none.
export async function readOutcomeReply(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  outcome: LogRecord,
): Promise<ApprovedReply | null> {
  const result = outcome.erasable.status === 'readable' ? outcome.erasable.fields['result'] : null;

  if (!isJSONObject(result)) {
    return null;
  }

  const images = await readOutcomeImages(log, outcome);

  return images.length === 0 ? null : { result, images };
}
