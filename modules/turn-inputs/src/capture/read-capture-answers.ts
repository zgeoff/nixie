import { captureAnswerSchema, capturePath } from '@heynixie/wire';
import type { TurnInputsContext } from '../types';

const defaultAskTimeoutMs = 2000;

// Asks each source's gateway whether it can capture to the source's folder. Only a yes marks the
// source able. A no, a bad reply, a timeout and a network error each mark it unable and log one
// reason code.
export async function readCaptureAnswers(ctx: TurnInputsContext): Promise<void> {
  ctx.answers.clear();

  const sources = Object.entries(ctx.config?.sources ?? {});

  await Promise.all(
    sources.map(async ([name, source]) => {
      const reason = await askGateway(source, ctx.askTimeoutMs ?? defaultAskTimeoutMs);

      ctx.answers.set(name, reason === null);

      if (reason !== null) {
        ctx.logger('turn_input.capture_refused', { source: name, reason }, 'warn');
      }
    }),
  );
}

type RefusalReason = 'refused' | 'status' | 'bad_body' | 'timeout' | 'network';

interface AskedSource {
  readonly baseURL: string;
  readonly directory: string;
}

async function askGateway(source: AskedSource, timeoutMs: number): Promise<RefusalReason | null> {
  const url = `${source.baseURL.replace(/\/+$/u, '')}${capturePath}?spool=${encodeURIComponent(source.directory)}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (response.status !== 200) {
      return 'status';
    }

    const body: unknown = await response.json();

    const answer = captureAnswerSchema.safeParse(body);

    if (!answer.success) {
      return 'bad_body';
    }

    return answer.data.canCapture ? null : 'refused';
  } catch (error) {
    if (error instanceof SyntaxError) {
      return 'bad_body';
    }

    return error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network';
  }
}
