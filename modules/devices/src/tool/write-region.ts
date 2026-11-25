import type { RegionContent } from '@heynixie/contract';
import { createShortID } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readLayout } from '../layout/read-layout';
import { deviceRegionShownCodec } from '../record/device-region-shown-codec';
import type { DeclaredFetch } from '../stream/create-page-fetches';
import type { DeviceTables } from '../types';
import type { DeviceToolOptions } from './device-tool-options';

interface RegionWrite {
  readonly deviceID: string;
  readonly thread: string;

  // the sequence of the call's own record: a layout set after it replaced the one the call was
  // queued against, so the write refuses
  readonly callSequence: number;
  readonly region: string;
  readonly content: RegionContent;

  // the fetches that the content declares, which the page's nixie.data reads once they ran
  readonly fetches: readonly DeclaredFetch[];
  readonly untilMs: number | null;
  readonly onEnd: 'blank' | 'previous';
}

// What a written region shows: the short ID of its content.
export interface WrittenRegion {
  readonly shownID: string;
}

// Records a region's content sealed under the record's own key, and points the region at it. The
// layout and the content it covers are read in the write's own transaction, so null comes back,
// with nothing written, for a layout set after the call or a region it lacks.
export async function writeRegion(
  options: DeviceToolOptions,
  write: RegionWrite,
): Promise<WrittenRegion | null> {
  const outcome = await withWriteTransaction(options.log.writer, async (tx) => {
    const inTransaction = { ...options.log, writer: { ...options.log.writer, db: tx } };

    const layout = await readLayout(inTransaction, write.deviceID, options.clock.now());

    const region = layout?.regions.find((candidate) => candidate.name === write.region);

    const row = await tx
      .$extendTables<DeviceTables>()
      .selectFrom('device_layouts')
      .select('layout_sequence')
      .where('device_id', '=', write.deviceID)
      .executeTakeFirst();

    if (row === undefined || row.layout_sequence > write.callSequence || region === undefined) {
      return null;
    }

    const shownID = createShortID();

    const [record] = await writeRecordsInTransaction(tx, options.log, [
      {
        kind: deviceRegionShownCodec.kind,
        definitions: options.definitions(),
        thread: write.thread,
        payload: deviceRegionShownCodec.encode({
          device: write.deviceID,
          region: write.region,
          shownID,
          contentKind: write.content.kind,
          until: write.untilMs,
          onEnd: write.onEnd,
          previous: write.onEnd === 'previous' ? (region.shown?.sequence ?? null) : null,
          call: write.callSequence,
        }),
        erasable: { content: toStoredContent(write.content) },
      },
    ]);

    invariant(record, 'the log wrote no device.region_shown record');

    const db = tx.$extendTables<DeviceTables>();

    await db
      .insertInto('device_regions')
      .values({
        device_id: write.deviceID,
        region: write.region,
        shown_sequence: record.sequence,
      })
      .onConflict((conflict) =>
        conflict.columns(['device_id', 'region']).doUpdateSet({ shown_sequence: record.sequence }),
      )
      .execute();

    await db
      .updateTable('devices')
      .set({ updated_at: options.clock.now() })
      .where('device_id', '=', write.deviceID)
      .execute();

    return { shownID };
  });

  if (outcome !== null) {
    options.streams.errors.remove(write.deviceID, write.region);
    options.streams.messages.remove(write.deviceID, write.region);
    options.streams.tickets.remove(write.deviceID, write.region);
    options.streams.fetches.remove(write.deviceID, write.region);

    if (write.fetches.length > 0) {
      options.streams.fetches.declare(
        { deviceID: write.deviceID, region: write.region },
        { shown: outcome.shownID, fetches: write.fetches, isCovered: true },
      );
    }
  }

  return outcome;
}

// The content as a JSON object, which leaves out a label or the images that the call left out.
function toStoredContent(content: RegionContent): JSONObject {
  if (content.kind === 'live' && content.live === 'countdown') {
    const countdown = { kind: content.kind, live: content.live, to: content.to };

    return content.label === undefined ? countdown : { ...countdown, label: content.label };
  }

  if (content.kind === 'html') {
    return {
      kind: content.kind,
      html: content.html,
      ...(content.images === undefined ? {} : { images: content.images }),
      ...(content.packages === undefined ? {} : { packages: content.packages }),
      ...(content.fetches === undefined ? {} : { fetches: toStoredFetches(content.fetches) }),
    };
  }

  return content;
}

// A fetch as the stored JSON holds it, which leaves out a refresh that the call left out.
function toStoredFetches(
  fetches: NonNullable<Extract<RegionContent, { kind: 'html' }>['fetches']>,
): JSONObject[] {
  return fetches.map((fetch): JSONObject =>
    fetch.refreshMinutes === undefined
      ? { url: fetch.url }
      : { url: fetch.url, refreshMinutes: fetch.refreshMinutes },
  );
}
