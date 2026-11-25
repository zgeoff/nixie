import { readPackageCard } from '@heynixie/devices';
import type { Log } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';

const addPackageToolName = 'device.addPackage';

// The card of a package install shows what the registry described when the call asked: its
// publisher, size and hash. It is read from the call's own record, so the owner approves what the
// install checks. A card that a forget erased has no body.
export async function readPackageBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool !== addPackageToolName) {
    return { status: 'none' };
  }

  const card = await readPackageCard(log, request.callSequence);

  if (card === null) {
    return { status: 'unreadable' };
  }

  return { status: 'fields', fields: {}, package: card };
}
