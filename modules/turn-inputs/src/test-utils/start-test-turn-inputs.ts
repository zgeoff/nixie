import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { getDataFilePath } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import type { LogFields, LogLevel } from '@heynixie/logger';
import type { ModelProfile } from '@heynixie/models';
import { decodeCaptureTag, sealSpoolBody } from '@heynixie/wire';
import { sql } from 'kysely';
import { createTurnInputs } from '../create-turn-inputs';
import { turnInputLogConfigSchema } from '../turn-input-log-config-schema';
import type { TurnInputsOptions } from '../types';

interface RecordedLine {
  readonly event: string;
  readonly fields: LogFields;
  readonly level: LogLevel | undefined;
}

export interface TestSpoolFile {
  readonly writer?: string;
  readonly counter: number;
  readonly status?: number;
  readonly body: Uint8Array;

  // the base URL of another capture, whose ID names the file
  readonly nameAs?: string;
}

export interface TestSpoolMiss {
  readonly counter: number;
  readonly reason: string;
  readonly writer?: string;
}

export interface TestTurnInputsOptions {
  // what the stub gateway answers to the capture ask: a status, or true or false for a 200
  readonly answer?: boolean | number | 'never';
  readonly holdsOwnValue?: (body: Uint8Array) => boolean;
  readonly config?: Record<string, unknown>;
  readonly noConfig?: boolean;
  readonly askTimeoutMs?: number;
  readonly keyStoreBusyTimeoutMs?: number;
}

type TestProfile = Pick<ModelProfile, 'id' | 'model' | 'harness' | 'baseURL'>;

export async function startTestTurnInputs(options: TestTurnInputsOptions = {}) {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const logOptions =
    options.keyStoreBusyTimeoutMs === undefined
      ? {}
      : { keyStoreBusyTimeoutMs: options.keyStoreBusyTimeoutMs };

  const test = await startTestLog(logOptions);
  const spoolDir = await mkdtemp(join(tmpdir(), 'nixie-spool-'));

  stack.defer(() => rm(spoolDir, { recursive: true, force: true }));

  const answer = options.answer ?? true;

  // the stub gateway's answer to the capture ask
  const answerAsk = async (): Promise<Response> => {
    if (answer === 'never') {
      await new Promise(() => {});
    }

    return typeof answer === 'number'
      ? new Response('no', { status: answer })
      : Response.json({ canCapture: answer });
  };

  const gateway = Bun.serve({
    port: 0,
    fetch: answerAsk,
  });

  stack.defer(() => gateway.stop(true));

  const gatewayURL = `http://127.0.0.1:${String(gateway.port)}`;
  const lines: RecordedLine[] = [];

  const config = options.noConfig
    ? null
    : turnInputLogConfigSchema.parse({
        close_wait: '500ms',
        sources: {
          // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the key of the deployment's config
          gateway: { base_url: gatewayURL, dir: spoolDir },
        },
        ...options.config,
      });

  const turnInputsOptions: TurnInputsOptions = {
    log: test.log,
    clock: test.clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    logger: (event, fields, level) => {
      lines.push({ event, fields: fields ?? {}, level });
    },
    config,
    holdsOwnValue: options.holdsOwnValue ?? (() => false),
    ...(options.askTimeoutMs === undefined ? {} : { askTimeoutMs: options.askTimeoutMs }),
  };

  const turnInputs = createTurnInputs(turnInputsOptions);

  const profile: TestProfile = {
    id: 'main',
    model: 'claude-test-1',
    harness: 'agent-sdk',
    baseURL: `${gatewayURL}/claude`,
  };

  return {
    ...test,
    turnInputs,
    turnInputsOptions,
    spoolDir,
    gatewayURL,
    lines,
    profile,

    // holds a read open on the key store, so a checkpoint finds it busy until the release
    startKeyStoreReader: async () => {
      const reader = startDatabase(getDataFilePath(test.dataDir, 'keys.db'));

      stack.defer(() => reader.destroy());

      await sql`begin`.execute(reader);
      await sql`select count(*) from record_keys`.execute(reader);

      return {
        release: async () => {
          await sql`commit`.execute(reader);
        },
      };
    },

    // writes a `.miss` file the way the gateway would
    writeMissFile: async (baseURL: string, miss: TestSpoolMiss): Promise<string> => {
      const tag = decodeCaptureTag(baseURL.split('/~in.')[1] ?? '');
      const writer = miss.writer ?? 'aa';
      const path = join(spoolDir, `${tag?.captureID ?? ''}.${writer}.${String(miss.counter)}.miss`);

      await Bun.write(
        path,
        JSON.stringify({
          version: 1,
          captureID: tag?.captureID,
          writer,
          counter: miss.counter,
          reason: miss.reason,
        }),
      );

      return path;
    },

    // writes a sealed `.cap` file the way the gateway would, to the capture of a base URL
    writeSpoolFile: async (baseURL: string, file: TestSpoolFile): Promise<string> => {
      const segment = baseURL.split('/~in.')[1] ?? '';
      const tag = decodeCaptureTag(segment);

      if (tag === null) {
        throw new Error('the base URL holds no capture tag');
      }

      const writer = file.writer ?? 'aa';
      const status = file.status ?? 200;

      const sealed = await sealSpoolBody(
        tag,
        {
          version: 1,
          captureID: tag.captureID,
          writer,
          counter: file.counter,
          receivedAt: test.clock.now(),
          route: 'claude',
          api: 'anthropic-messages',
          endpoint: 'messages',
          bytes: file.body.length,
        },
        file.body,
      );

      await mkdir(spoolDir, { recursive: true });

      const named = decodeCaptureTag(file.nameAs?.split('/~in.')[1] ?? segment);
      const name = `${named?.captureID ?? tag.captureID}.${writer}.${String(file.counter)}.${String(status)}.cap`;
      const path = join(spoolDir, name);

      await Bun.write(path, sealed);

      return path;
    },
  };
}
