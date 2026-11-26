import type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  ProviderResponse,
} from '@heynixie/connectors';
import { packageInputSchema } from '@heynixie/contract';
import type { ToolOutcome } from '@heynixie/tools';
import { readPackageCard } from '../package/package-card';
import { readDevicePackage } from '../package/read-device-packages';
import type { DeviceToolOptions } from './device-tool-options';
import type { PackageCallSource } from './run-package-install';
import { listedFilesLimit, runPackageInstall } from './run-package-install';

const addPackageToolName = 'device.addPackage';

// A check reads only nixie's own database, so a miss is a miss.
const trustNegativeAfterMs = 1000;

// The action queue's connector for an approved device.addPackage call. The install of a call whose
// outcome is unknown counts when the package of the call's own card is stored, so a retry never
// answers PACKAGE_KNOWN for an install that went through.
export function buildDevicePackageConnector(
  options: DeviceToolOptions,
  readSource: (actionID: string) => Promise<PackageCallSource | null>,
): ActionConnector {
  return {
    reconcile: {
      kind: 'check',
      tool: addPackageToolName,
      onNotFound: 'retry',
      trustNegativeAfterMs,
    },
    run: async (attempt) => {
      const source = await readSource(attempt.actionID);

      if (source === null) {
        return { kind: 'refused', reason: 'the action holds no call of device.addPackage' };
      }

      const outcome = await runPackageInstall(options, attempt.arguments, source);

      return toProviderResponse(outcome);
    },
    check: (attempt) => readInstalled(options, readSource, attempt),
  };
}

function toProviderResponse(outcome: ToolOutcome): ProviderResponse {
  if (outcome.status === 'error') {
    return { kind: 'refused', reason: outcome.message };
  }

  if (outcome.refusalCode === undefined) {
    return { kind: 'success', result: outcome.result };
  }

  const message = outcome.result['message'];

  return {
    kind: 'refused',
    reason:
      typeof message === 'string' ? `${outcome.refusalCode}: ${message}` : outcome.refusalCode,
  };
}

async function readInstalled(
  options: DeviceToolOptions,
  readSource: (actionID: string) => Promise<PackageCallSource | null>,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const parsed = packageInputSchema.safeParse(attempt.arguments);

  const source = await readSource(attempt.actionID);

  if (!parsed.success || source === null) {
    return { kind: 'inconclusive' };
  }

  const card = await readPackageCard(options.log, source.callSequence);

  const stored = await readDevicePackage(
    options.log.writer.db,
    parsed.data.name,
    parsed.data.version,
  );

  if (card === null || stored === null || stored.integrity !== card.integrity) {
    return { kind: 'not_found' };
  }

  return {
    kind: 'found',
    result: {
      package: `${stored.name}@${stored.version}`,
      files: stored.files.slice(0, listedFilesLimit),
      fileCount: stored.files.length,
    },
  };
}
