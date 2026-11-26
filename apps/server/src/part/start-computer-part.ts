import { join } from 'node:path';
import type { ComputerTools } from '@heynixie/connectors';
import {
  buildComputerTools,
  makeHandoverRecords,
  makeTakeoverRecords,
  makeUnexemptScans,
  startComputer,
} from '@heynixie/connectors';
import type { Secrets } from '@heynixie/credentials';
import type { Definitions, Log } from '@heynixie/log';
import { makeOwnerTypedCheck } from '@heynixie/memory';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import { makeSecretFinder } from '@heynixie/secret-scan';
import invariant from 'tiny-invariant';
import { getSandboxImage } from '../sandbox/get-sandbox-image';
import type { ServerPartsOptions } from '../server/start-server';

export interface ComputerPartInputs {
  readonly options: Pick<
    ServerPartsOptions,
    'sandbox' | 'images' | 'config' | 'cleanup' | 'log' | 'harness'
  > & {
    readonly secrets: Pick<Secrets, 'ownValues'>;
  };
  readonly adapter: SandboxAdapter;
  readonly log: Log;
  readonly definitions: () => Definitions;
}

const imageArgv = ['/usr/local/bin/bun', '/app/computer.js'] as const;

const testArgv = [
  process.execPath,
  join(import.meta.dir, '../../../../guests/computer/src/test-main.ts'),
] as const;

// where the computer image keeps its disk, and where the browser and shell images of the release
// before it kept theirs: the home of the image's own user
const imageHomeEnv = { HOME: '/home/computer' } as const;
const legacyImageHomeEnv = { HOME: '/home/bun' } as const;

// The assistant's computer: one long-lived sandbox and the tools that drive it.
export async function startComputerPart(inputs: ComputerPartInputs): Promise<ComputerTools> {
  const options = inputs.options;
  const computerConfig = options.config.computer;

  invariant(computerConfig !== undefined, 'the computer part starts only with a computer section');

  const webFetch = options.config.web_fetch;
  const publicEgress = options.sandbox.adapter === 'imp' ? options.sandbox.imp.publicEgress : null;

  const deniedRanges = [
    ...(publicEgress?.hostAddresses ?? []),
    ...(publicEgress?.egressDeny ?? []),
  ];

  const findSecret = makeSecretFinder(() =>
    options.secrets.ownValues.read({
      entries: webFetch.secretOwnValues,
      minChars: webFetch.secretOwnValueMinChars,
    }),
  );

  const isTest = isTestSandbox(inputs.adapter);
  const records = makeTakeoverRecords({ log: inputs.log, definitions: inputs.definitions });

  const computer = startComputer({
    adapter: inputs.adapter,
    image: getSandboxImage(options.images, 'computer').name,
    argv: isTest ? testArgv : imageArgv,
    ...(isTest ? {} : { homeEnv: imageHomeEnv, legacyHomeEnv: legacyImageHomeEnv }),
    deniedRanges,
    timeZone: options.config.time.default_zone,
    scans: makeUnexemptScans({ findSecret, logger: options.log }),
    logger: options.log,
    ...(options.harness === undefined ? {} : { clock: options.harness.link.clock }),
    takeover: { idleMs: computerConfig.idle_hand_back_minutes * 60_000, records },
    handover: {
      expiryMs: computerConfig.handover_expiry_minutes * 60_000,
      records: makeHandoverRecords({ log: inputs.log, definitions: inputs.definitions }),
    },
  });

  await options.cleanup.defer(() => computer.stop());

  return buildComputerTools({
    computer,
    log: inputs.log,
    findSecret,
    isOwnerTyped: makeOwnerTypedCheck(inputs.log),
    logger: options.log,
    deniedRanges,
    fetch: webFetch,
  });
}
