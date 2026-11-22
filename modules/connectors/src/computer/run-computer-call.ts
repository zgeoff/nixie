import type { JSONObject } from '@heynixie/log';
import type { DirectResult, ToolRun } from '@heynixie/tools';
import type { ComputerReply, ComputerRequest } from '@heynixie/wire';
import { makeTypedExemption } from '../page/make-typed-exemption';
import { refuseFetchURL } from '../page/refuse-fetch-url';
import type { SecretScan } from '../page/secret-scan';
import type { ComputerToolOptions } from './computer-tool-options';
import type { CallResult, ComputerScan, ScanVerdict } from './types';

export type ComputerOutcome =
  | { readonly kind: 'reply'; readonly reply: Exclude<ComputerReply, { kind: 'failed' }> }
  | { readonly kind: 'refused'; readonly result: DirectResult };

export interface ComputerCallInput {
  readonly run: ToolRun;
  readonly request: ComputerRequest;
  readonly timeoutMs: number;

  // the URL the owner typed or the model named, whose typed copy exempts it from the secret scan
  readonly namedURL: string | null;
}

// A refusal that changed nothing: the code, and a sentence that says what to change.
export function refuseComputer(
  code: string,
  message: string,
  fields: JSONObject = {},
): DirectResult {
  return { result: { refused: { code, message, ...fields } }, refusalCode: code };
}

// Sends one request to the computer and sorts the answer into a reply or a refusal.
export async function runComputerCall(
  options: ComputerToolOptions,
  input: ComputerCallInput,
): Promise<ComputerOutcome> {
  const scan: SecretScan = {
    findSecret: options.findSecret,
    logger: options.logger,
    isExempt:
      input.namedURL === null
        ? () => Promise.resolve(false)
        : makeTypedExemption({
            isOwnerTyped: options.isOwnerTyped,
            run: input.run,
            namedURL: input.namedURL,
            covers: options.fetch.secretTypedURLCovers,
          }),
  };

  const result = await options.computer.call({
    request: input.request,
    timeoutMs: input.timeoutMs,
    scan: (url) => scanURL(url, scan),
    scanText: (text) => scanText(text, scan),
  });

  return sortCallResult(result);
}

// The scans of a queued action, which has no typed URL to exempt.
export function makeActionScans(options: ComputerToolOptions): {
  readonly scan: ComputerScan;
  readonly scanText: ComputerScan;
} {
  return makeUnexemptScans(options);
}

// The scans of a request that no call made. They exempt nothing, and a refusal writes no record.
export function makeUnexemptScans(options: Pick<ComputerToolOptions, 'findSecret' | 'logger'>): {
  readonly scan: ComputerScan;
  readonly scanText: ComputerScan;
} {
  const scan: SecretScan = {
    findSecret: options.findSecret,
    logger: options.logger,
    isExempt: () => Promise.resolve(false),
  };

  return { scan: (url) => scanURL(url, scan), scanText: (text) => scanText(text, scan) };
}

// Asks the computer to move the disks of an earlier release, and refuses the tool until it has.
export async function refuseUntilMoved(options: ComputerToolOptions): Promise<DirectResult | null> {
  const gate = await options.computer.settleMove();

  if (gate === 'ready') {
    return null;
  }

  return gate === 'busy'
    ? refuseComputer('BUSY', 'another call is using the computer; try again in a moment')
    : refuseComputer(
        'COMPUTER_MOVING',
        'the computer is moving to a new disk and cannot be used yet; try again in a moment',
      );
}

async function scanURL(url: string, scan: SecretScan): Promise<ScanVerdict> {
  const reason = await refuseFetchURL(url, scan);

  return reason === null ? { kind: 'pass' } : { kind: 'refuse', reason };
}

const contentRefusalEvent = 'computer.secret_refused';

// The headers and body of a request never hold a URL the owner typed, so no exemption applies.
function scanText(text: string, scan: SecretScan): Promise<ScanVerdict> {
  const found = scan.findSecret(text);

  if (found === null) {
    return Promise.resolve({ kind: 'pass' });
  }

  scan.logger(contentRefusalEvent, { rule: found.rule });

  return Promise.resolve({
    kind: 'refuse',
    reason: `the request holds a secret (rule ${found.rule}), so it was not sent`,
  });
}

export function sortCallResult(result: CallResult): ComputerOutcome {
  if (result.status === 'busy') {
    return refused('BUSY', 'another call is using the computer; try again in a moment');
  }

  if (result.status === 'moving') {
    return refused(
      'COMPUTER_MOVING',
      'the computer is moving to a new disk and cannot be used yet; try again in a moment',
    );
  }

  if (result.status === 'out_of_memory') {
    return refused(
      'OUT_OF_MEMORY',
      'the computer ran out of memory and a process was stopped; a browser tab may be closed, and the files on its disk are kept',
      { sandbox: 'computer' },
    );
  }

  if (result.status === 'failed') {
    return refused('COMPUTER_FAILED', `the computer stopped answering: ${result.message}`);
  }

  if (result.reply.kind !== 'failed') {
    return { kind: 'reply', reply: result.reply };
  }

  if (result.refusal !== null) {
    return refused('SECRET_REFUSED', result.refusal);
  }

  return refused(
    result.reply.reason.toUpperCase(),
    result.reply.message ?? `the computer refused the call: ${result.reply.reason}`,
  );
}

function refused(code: string, message: string, fields: JSONObject = {}): ComputerOutcome {
  return { kind: 'refused', result: refuseComputer(code, message, fields) };
}
