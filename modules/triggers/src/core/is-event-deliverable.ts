import type { ScheduleTriggerEvent } from '../types';

export interface DeliveryRow {
  readonly source_id: string;
  readonly definition_hash: string | null;

  // the watermark, epoch milliseconds
  readonly after: number;
}

// Rows 1 and 2 of the table of one deliver call: false when the event writes nothing.
export function isEventDeliverable(
  event: Pick<ScheduleTriggerEvent, 'definitionHash' | 'kind' | 'scheduledFor'>,
  sourceID: string,
  row: DeliveryRow | undefined,
  isKeyTaken: boolean,
): boolean {
  if (isKeyTaken || row === undefined) {
    return false;
  }

  if (row.definition_hash === null || row.source_id !== sourceID) {
    return false;
  }

  if (row.definition_hash !== event.definitionHash) {
    return false;
  }

  return event.kind !== 'schedule' || Date.parse(event.scheduledFor) > row.after;
}
