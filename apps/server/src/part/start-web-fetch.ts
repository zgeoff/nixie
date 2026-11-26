import { join } from 'node:path';
import type { Clock } from '@heynixie/clock';
import { systemClock } from '@heynixie/clock';
import type {
  FetchBackoff,
  FetchSandbox,
  IsOwnerTyped,
  WebFetchConfig,
} from '@heynixie/connectors';
import {
  buildWebFetchTool,
  makeFetchBackoff,
  startFetchSandbox,
  webFetchDefaults,
} from '@heynixie/connectors';
import { defaultSizeLimits } from '@heynixie/definitions';
import type { AddressCheck } from '@heynixie/egress';
import { makeAddressCheck } from '@heynixie/egress';
import type { Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { isTestSandbox } from '@heynixie/sandbox';
import type { SecretFinder } from '@heynixie/secret-scan';
import type { ReadPage } from '@heynixie/skills';
import type { ToolDefinition } from '@heynixie/tools';

export interface WebFetchOptions {
  readonly adapter: SandboxAdapter;

  readonly image: string;
  readonly argv?: readonly string[];

  readonly deniedRanges: readonly string[];
  readonly config?: WebFetchConfig;

  // the log whose writer holds the link store
  readonly log: Pick<Log, 'writer'>;

  // the clock of the host pauses; the system clock when absent
  readonly clock?: Clock;

  // refuses a URL or a redirect hop of the tool's fetches that holds a secret; the skill file
  // reader's fetches take no scan
  readonly findSecret: SecretFinder;
  readonly isOwnerTyped: IsOwnerTyped;

  // the server log
  readonly logger: Logger;
}

export interface WebFetch {
  readonly tool: ToolDefinition;

  readonly readSkillPage: ReadPage;

  // reads the text and the links of an HTML document, such as a mail's, in a fetch sandbox
  readonly readHTML: FetchSandbox['readHTML'];

  // reads a response body as text, and unpacks an npm package, for the device pages' declared
  // fetches and approved packages, in a sandbox of their own
  readonly deviceFetch: Pick<FetchSandbox, 'readBody' | 'readPackage'>;

  // the host pauses of the web fetch, which a declared fetch joins
  readonly backoff: FetchBackoff;

  // whether an address is public, which a page's declared fetch must pass when it names one
  readonly checkAddress: AddressCheck;

  // the scan that refuses a declared URL that holds a secret, as the tool's own scan does
  readonly findSecret: SecretFinder;

  // the server log
  readonly logger: Logger;

  // the address of the npm registry that approved packages come from
  readonly packageRegistry: string;

  // empties the pause of every host, for the cleanup of a forgotten session
  readonly clearPauses: () => void;

  readonly stop: () => Promise<void>;
}

export const fetchImageArgv: readonly string[] = ['/usr/local/bin/bun', '/app/fetch.js'];

// A vendored skill's file may reach the definitions file limit, far past the web fetch's text limit.
const skillFetchBytes = defaultSizeLimits.maxFileBytes;

// The tool stores the whole page, so the fetcher's text has to stop only where its body does. One
// body byte decodes to at most 3 bytes of UTF-8 text: an invalid byte becomes U+FFFD, and a
// one-byte Shift_JIS katakana a 3-byte character.
const textBytesPerBodyByte = 3;

const testFetchArgv: readonly string[] = [
  process.execPath,
  join(import.meta.dir, '../../../../guests/fetch/src/main.ts'),
];

export function startWebFetch(options: WebFetchOptions): WebFetch {
  const config = options.config ?? webFetchDefaults;

  const sandbox = {
    adapter: options.adapter,
    image: options.image,
    argv: options.argv ?? (isTestSandbox(options.adapter) ? testFetchArgv : fetchImageArgv),
    deniedRanges: options.deniedRanges,
    sandboxLimits: config.sandboxLimits,
  };

  const fetchSandbox = startFetchSandbox({
    ...sandbox,
    limits: { ...config.limits, textBytes: config.limits.bodyBytes * textBytesPerBodyByte },
  });

  // a skill holds only text files, so the skill fetch reads no image body
  const skillSandbox = startFetchSandbox({
    ...sandbox,
    limits: {
      ...config.limits,
      bodyBytes: skillFetchBytes,
      textBytes: skillFetchBytes,
      imageBytes: 0,
    },
    owner: 'skill_fetch',
  });

  // a declared fetch reads at most 1 MiB of body as text, which no page of the web fetch shares
  const deviceFetchBytes = 1_048_576;

  // a declared fetch follows at most 3 redirects, within its own host
  const deviceFetchRedirects = 3;

  const deviceSandbox = startFetchSandbox({
    ...sandbox,
    limits: {
      ...config.limits,
      bodyBytes: deviceFetchBytes,
      redirects: deviceFetchRedirects,
      textBytes: deviceFetchBytes * textBytesPerBodyByte,
      imageBytes: 0,
    },
    owner: 'device_fetch',
  });

  const clock = options.clock ?? systemClock;

  const backoff = makeFetchBackoff({
    backoffMs: config.backoff.backoffMs,
    backoffCapMs: config.backoff.backoffCapMs,
    clock,
  });

  return {
    tool: buildWebFetchTool(fetchSandbox.readPage, {
      log: options.log,
      textBytes: config.limits.textBytes,
      linkPathChars: config.linkPathChars,
      pageStoreBytes: config.pageStoreBytes,
      imageLongEdge: config.imageLongEdge,
      backoff,
      backoffWaitMs: config.backoff.backoffWaitMs,
      cacheMs: config.cacheMs,
      clock,
      findSecret: options.findSecret,
      isOwnerTyped: options.isOwnerTyped,
      logger: options.logger,
      secretTypedURLCovers: config.secretTypedURLCovers,
    }),
    readSkillPage: skillSandbox.readPage,
    readHTML: fetchSandbox.readHTML,
    deviceFetch: { readBody: deviceSandbox.readBody, readPackage: deviceSandbox.readPackage },
    backoff,
    findSecret: options.findSecret,
    logger: options.logger,
    checkAddress: makeAddressCheck(options.deniedRanges),
    packageRegistry: config.packageRegistry,
    clearPauses: backoff.clear,
    stop: async () => {
      await Promise.all([fetchSandbox.stop(), skillSandbox.stop(), deviceSandbox.stop()]);
    },
  };
}
