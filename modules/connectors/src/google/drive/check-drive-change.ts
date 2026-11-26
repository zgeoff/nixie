import type { ActionAttempt, CheckResponse, ConnectorContext } from '../../types';
import type { ActionMarker } from '../build-action-marker';
import { isMarkerLossProvable } from '../build-action-marker';
import { buildAttemptMarker } from '../build-attempt-marker';
import { callGoogle } from '../call-google';
import { buildItemID } from '../gmail/build-item-id';
import { parseItemID } from '../gmail/parse-item-id';
import { readCallContext } from '../gmail/read-call-context';
import type { GoogleDeps } from '../types';
import { buildDriveListQuery } from './build-drive-list-query';
import { driveFileFields, driveListSchema } from './constants';
import { driveToolNames } from './drive-tool-names';
import { parseDriveFile } from './parse-drive-file';
import { readDriveFile } from './read-drive-file';
import type { DriveFile } from './types';

// The read-only check of a Drive write of unknown outcome. A create is found when a search of the
// app properties finds the marker, and a change when the file holds it. Any failed read is
// inconclusive.
export async function checkDriveChange(
  deps: GoogleDeps,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  if (context === null) {
    return { kind: 'inconclusive' };
  }

  const marker = buildAttemptMarker(attempt, deps.clock.now());

  if (attempt.tool === driveToolNames.create) {
    const found = await readMarkedFile(deps, context, marker);

    if (found === 'failed') {
      return { kind: 'inconclusive' };
    }

    return found === null
      ? { kind: 'not_found' }
      : {
          kind: 'found',
          result: { file: buildItemID(context.connection, found.id), link: found.link },
        };
  }

  const text = attempt.arguments['file'];
  const item = typeof text === 'string' ? parseItemID(text) : null;

  if (item === null) {
    return { kind: 'inconclusive' };
  }

  const read = await readDriveFile(deps.hosts, context, item.id);

  if (read.kind !== 'file') {
    return { kind: 'inconclusive' };
  }

  if (marker.key in read.file.appProperties) {
    return {
      kind: 'found',
      result: { file: buildItemID(context.connection, item.id), link: read.file.link },
    };
  }

  return isMarkerLossProvable(read.file.appProperties)
    ? { kind: 'not_found' }
    : { kind: 'inconclusive' };
}

// the pages of the marker search that a check follows, which no real search needs more than a few of
const maxSearchPages = 10;

// The file that holds the marker, found by a search of the app properties through every page: Drive
// can answer a page with no file and a token for the next. Null when the search ends with none, and
// 'failed' when a page cannot be read or the pages run out of the limit.
async function readMarkedFile(
  deps: GoogleDeps,
  context: ConnectorContext,
  marker: ActionMarker,
): Promise<DriveFile | 'failed' | null> {
  let pageToken: string | undefined;

  for (let page = 0; page < maxSearchPages; page += 1) {
    const query = buildDriveListQuery(
      `appProperties has { key='${marker.key}' and value='${marker.value}' }`,
      {
        fields: `nextPageToken,files(${driveFileFields})`,
        ...(pageToken === undefined ? {} : { pageToken }),
      },
    );

    const listed = await callGoogle(deps.hosts, context, { path: '/drive/v3/files', query });

    const files = listed.kind === 'ok' ? driveListSchema.safeParse(listed.body) : null;

    if (files === null || !files.success) {
      return 'failed';
    }

    const [first] = (files.data.files ?? []).flatMap((item) => {
      const file = parseDriveFile(item);

      return file === null ? [] : [file];
    });

    if (first !== undefined) {
      return first;
    }

    pageToken = files.data.nextPageToken;

    if (pageToken === undefined) {
      return null;
    }
  }

  return 'failed';
}
