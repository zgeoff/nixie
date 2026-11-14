import { constants } from 'node:fs';
import { access, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Logger } from '@heynixie/logger';
import type { CaptureTag, ModelAPI, SpoolHeader, SpoolMiss } from '@heynixie/wire';
import { formatSpoolFileName, parseSpoolFileName, sealSpoolBody } from '@heynixie/wire';
import { isRecord } from './is-record';
import type { CaptureConfig } from './types';

interface CaptureRequest {
  readonly tag: CaptureTag;
  readonly receivedAt: number;
  readonly route: string;
  readonly api: ModelAPI;
  readonly endpoint: 'messages' | 'responses';
  readonly body: Uint8Array;
}

// Neither method waits for the spool: the work runs behind them, and a fault in it never reaches
// the request.
interface CaptureHandle {
  // the model API answered with this status
  readonly finish: (upstreamStatus: number) => void;

  // the model API gave no response
  readonly drop: () => void;
}

export interface CaptureSpool {
  // random for each start of the gateway
  readonly writer: string;

  readonly begin: (request: CaptureRequest) => CaptureHandle;

  // answers whether this gateway captures to that folder, checked at the time of the ask
  readonly probeCapture: (spool: string) => Promise<boolean>;

  // resolves when every write, rename, removal and miss so far has ended
  readonly settle: () => Promise<void>;
}

export interface CaptureSpoolOptions {
  readonly config: CaptureConfig;
  readonly log: Logger;
  readonly seal?: typeof sealSpoolBody;
}

type WriteOutcome = 'written' | SpoolMiss['reason'];

const idleHandle: CaptureHandle = {
  finish: () => {},
  drop: () => {},
};

export async function createCaptureSpool(options: CaptureSpoolOptions): Promise<CaptureSpool> {
  const spool = options.config.spool;
  const log = options.log;
  const seal = options.seal ?? sealSpoolBody;

  if (!(await probeSpool(spool))) {
    throw new Error(
      `the capture spool ${spool} is not a directory that the model gateway can write and enter`,
    );
  }

  // a .part file of an earlier start, of any writer, never gets its rename
  for (const name of await readdir(spool)) {
    if (parseSpoolFileName(name)?.kind === 'part') {
      await rm(join(spool, name), { force: true });
    }
  }

  const writer = Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('hex');

  const counters = new Map<string, number>();
  const inflight = new Set<Promise<undefined>>();

  let pending = 0;

  // the size check and the create of two bodies never interleave, so the folder cannot pass its
  // limit by more than the one file in hand
  let writeTail: Promise<void> = Promise.resolve();

  const withWriteTurn = async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = writeTail;
    const turn = Promise.withResolvers<undefined>();

    writeTail = turn.promise;

    await previous;

    try {
      return await work();
    } finally {
      turn.resolve(undefined);
    }
  };

  const track = (work: Promise<unknown>): void => {
    const done = Promise.withResolvers<undefined>();

    inflight.add(done.promise);

    void (async () => {
      try {
        await work;
      } catch (error) {
        log('capture.task_failed', { code: readErrorCode(error) }, 'error');
      } finally {
        inflight.delete(done.promise);
        done.resolve(undefined);
      }
    })();
  };

  const writeMiss = async (
    request: CaptureRequest,
    counter: number,
    reason: SpoolMiss['reason'],
  ): Promise<void> => {
    const captureID = request.tag.captureID;
    const miss: SpoolMiss = { version: 1, captureID, writer, counter, reason };
    const name = formatSpoolFileName({ kind: 'miss', captureID, writer, counter });

    try {
      await writeFile(join(spool, name), JSON.stringify(miss), { flag: 'wx' });
    } catch (error) {
      log('capture.miss_failed', { reason, code: readErrorCode(error) }, 'error');
    }
  };

  const writePart = async (partPath: string, file: Uint8Array): Promise<WriteOutcome> => {
    try {
      const used = await readSpoolBytes(spool);

      if (used + file.length > options.config.maxBytes) {
        return 'spool_full';
      }

      await writeFile(partPath, file, { flag: 'wx' });

      return 'written';
    } catch {
      try {
        await rm(partPath, { force: true });
      } catch {
        // nothing more to remove: the miss that follows records the failure
      }

      return 'spool_write_failed';
    }
  };

  const sealBody = async (request: CaptureRequest, counter: number): Promise<Uint8Array | null> => {
    const header: Omit<SpoolHeader, 'ephemeralKey' | 'iv'> = {
      version: 1,
      captureID: request.tag.captureID,
      writer,
      counter,
      receivedAt: request.receivedAt,
      route: request.route,
      api: request.api,
      endpoint: request.endpoint,
      bytes: request.body.length,
    };

    try {
      return await seal(request.tag, header, request.body);
    } catch {
      return null;
    }
  };

  const writeBody = async (
    request: CaptureRequest,
    counter: number,
    partPath: string,
  ): Promise<boolean> => {
    try {
      const file = await sealBody(request, counter);

      if (file === null) {
        await writeMiss(request, counter, 'seal_failed');

        return false;
      }

      const outcome = await withWriteTurn(() => writePart(partPath, file));

      if (outcome === 'written') {
        return true;
      }

      await writeMiss(request, counter, outcome);

      return false;
    } finally {
      pending -= 1;
    }
  };

  const finishBody = async (
    written: Promise<boolean>,
    request: CaptureRequest,
    counter: number,
    upstreamStatus: number,
  ): Promise<void> => {
    const isWritten = await written;

    if (!isWritten) {
      return;
    }

    const captureID = request.tag.captureID;
    const partName = formatSpoolFileName({ kind: 'part', captureID, writer, counter });

    const capName = formatSpoolFileName({
      kind: 'cap',
      captureID,
      writer,
      counter,
      upstreamStatus,
    });

    try {
      await rename(join(spool, partName), join(spool, capName));
    } catch {
      await rm(join(spool, partName), { force: true });
      await writeMiss(request, counter, 'spool_write_failed');
    }
  };

  const dropBody = async (
    written: Promise<boolean>,
    request: CaptureRequest,
    counter: number,
  ): Promise<void> => {
    const isWritten = await written;

    if (isWritten) {
      const captureID = request.tag.captureID;

      await rm(join(spool, formatSpoolFileName({ kind: 'part', captureID, writer, counter })), {
        force: true,
      });
    }
  };

  const begin = (request: CaptureRequest): CaptureHandle => {
    const counter = (counters.get(request.tag.captureID) ?? 0) + 1;

    counters.set(request.tag.captureID, counter);

    if (pending >= options.config.maxPending) {
      track(writeMiss(request, counter, 'queue_full'));

      return idleHandle;
    }

    pending += 1;

    const captureID = request.tag.captureID;
    const partPath = join(spool, formatSpoolFileName({ kind: 'part', captureID, writer, counter }));
    const written = writeBody(request, counter, partPath);

    track(written);

    return {
      finish: (upstreamStatus) => {
        track(finishBody(written, request, counter, upstreamStatus));
      },
      drop: () => {
        track(dropBody(written, request, counter));
      },
    };
  };

  return {
    writer,
    begin,
    probeCapture: (asked) =>
      resolve(asked) === resolve(spool) ? probeSpool(spool) : Promise.resolve(false),
    settle: async () => {
      while (inflight.size > 0) {
        await Promise.all(inflight);
      }
    },
  };
}

async function probeSpool(spool: string): Promise<boolean> {
  try {
    const info = await stat(spool);

    await access(spool, constants.W_OK | constants.X_OK);

    return info.isDirectory();
  } catch {
    return false;
  }
}

function readErrorCode(error: unknown): string {
  return isRecord(error) && typeof error['code'] === 'string' ? error['code'] : 'unknown';
}

async function readSpoolBytes(spool: string): Promise<number> {
  let total = 0;

  for (const name of await readdir(spool)) {
    if (parseSpoolFileName(name) === null) {
      continue;
    }

    try {
      const info = await stat(join(spool, name));

      total += info.size;
    } catch (error) {
      // nixie removes files while the gateway reads the folder
      if (readErrorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }

  return total;
}
