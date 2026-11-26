import type { ActionAttempt, CheckResponse } from '../../types';
import { isMarkerLossProvable } from '../build-action-marker';
import { callGoogle } from '../call-google';
import { buildItemID } from '../gmail/build-item-id';
import { parseItemID } from '../gmail/parse-item-id';
import { readCallContext } from '../gmail/read-call-context';
import { readActionMarker } from '../read-action-marker';
import type { GoogleDeps } from '../types';
import { buildDriveListQuery } from './build-drive-list-query';
import { driveFileFields, driveListSchema } from './constants';
import { driveToolNames } from './drive-tool-names';
import { parseDriveFile } from './parse-drive-file';
import { readDriveFile } from './read-drive-file';

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

  const marker = await readActionMarker(deps, attempt.actionID);

  if (attempt.tool === driveToolNames.create) {
    const query = buildDriveListQuery(
      `appProperties has { key='${marker.key}' and value='${marker.value}' }`,
      { fields: `files(${driveFileFields})` },
    );

    const listed = await callGoogle(deps.hosts, context, { path: '/drive/v3/files', query });

    const files = listed.kind === 'ok' ? driveListSchema.safeParse(listed.body) : null;

    if (files === null || !files.success) {
      return { kind: 'inconclusive' };
    }

    const [first] = (files.data.files ?? []).flatMap((item) => {
      const file = parseDriveFile(item);

      return file === null ? [] : [file];
    });

    return first === undefined
      ? { kind: 'not_found' }
      : {
          kind: 'found',
          result: { file: buildItemID(context.connection, first.id), link: first.link },
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
