import type { CheckerResult, ConsentCheck } from '@heynixie/log';
import { collectConsentMessages } from './collect-consent-messages';
import { collectConsentSequences } from './collect-consent-sequences';
import { consentCheckerPrompt } from './consent-checker-prompt';
import { isCodeCheckPassed } from './is-code-check-passed';
import { isTypedWord } from './is-typed-word';
import { renderConsentInput } from './render-consent-input';
import type {
  ConsentAnswer,
  ConsentMessage,
  EffectDeclaration,
  KnownContact,
  PolicyCall,
  RunConsentCheck,
} from './types';

export interface ConsentOptions {
  // owner messages only: a sequence that names any other record is left out
  readonly readOwnerMessages: (sequences: readonly number[]) => Promise<readonly ConsentMessage[]>;
  readonly isTypedText: (message: ConsentMessage, text: string) => boolean;
  readonly runCheck: RunConsentCheck;
  readonly getLinkMaxAgeMs: () => number;
  readonly timeoutMs?: number;
}

export interface ConsentFacts {
  readonly declaration: EffectDeclaration;
  readonly contacts: readonly KnownContact[];
}

// null when the call has no turn message and no link within the window
export async function checkConsent(
  options: ConsentOptions,
  call: PolicyCall,
  facts: ConsentFacts,
): Promise<ConsentCheck | null> {
  const sequences = collectConsentSequences(call);

  if (sequences.length === 0) {
    return null;
  }

  const read = await options.readOwnerMessages(sequences);

  const messages = collectConsentMessages(call, read, {
    linkMaxAgeMs: options.getLinkMaxAgeMs(),
  });

  if (messages.length === 0) {
    return null;
  }

  const messageSequences = messages.map((message) => message.sequence);

  const isCodePassed = isCodeCheckPassed(
    call.destinations.map((destination) => destination.value),
    facts.contacts,
    (text) => messages.some((message) => options.isTypedText(message, text)),
    (name) => messages.some((message) => isTypedWord(message, name)),
  );

  if (!isCodePassed) {
    return { messageSequences, codeCheck: 'fail', checker: 'no' };
  }

  const checker = await askChecker(options, renderConsentInput(messages, call, facts.declaration));

  return { messageSequences, codeCheck: 'pass', checker };
}

export const consentCheckerTimeoutMs = 15_000;

async function askChecker(options: ConsentOptions, input: string): Promise<CheckerResult> {
  const timeoutMs = options.timeoutMs ?? consentCheckerTimeoutMs;
  const timer = Promise.withResolvers<'unreachable'>();

  const handle = setTimeout(() => {
    timer.resolve('unreachable');
  }, timeoutMs);

  try {
    const answered = await Promise.race([
      options.runCheck({ prompt: consentCheckerPrompt, input }).then(toCheckerResult),
      timer.promise,
    ]);

    return answered;
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(handle);
  }
}

function toCheckerResult(answer: ConsentAnswer): CheckerResult {
  if (answer.failure !== null) {
    return 'unreachable';
  }

  if (answer.verdict === 'asserted') {
    return 'yes';
  }

  return answer.verdict === 'not_asserted' ? 'no' : 'unsure';
}
