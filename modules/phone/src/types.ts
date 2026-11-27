import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, JSONObject, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { WakeRulesConfig } from '@heynixie/triggers';

// One text that the provider holds for the assistant's number.
export interface ProviderText {
  // the provider's message ID
  readonly messageID: string;

  // the sender's number in E.164 form, or the sender name
  readonly from: string;

  // epoch ms, the provider's receive time
  readonly receivedAt: number;
  readonly body: string;
}

export interface TextRequest {
  readonly to: string;
  readonly body: string;
}

export type ProviderSend =
  | { readonly kind: 'sent'; readonly messageID: string }

  // the provider refused the text and sent nothing
  | { readonly kind: 'refused'; readonly reason: string };

export interface SentTextQuery extends TextRequest {
  // epoch ms: the window in which the provider created the text
  readonly fromMs: number;
  readonly untilMs: number;
}

// The one interface through which nixie reaches the phone provider. An adapter per provider
// implements it; a fake stands in for tests and the test build. A call that fails to reach the
// provider throws, and a send that throws has an unknown outcome.
export interface PhoneProvider {
  // The newest texts that the number received, newest first, at most one page of them. The source
  // reads it at its first start, to record where the provider stands.
  readonly readRecent: () => Promise<readonly ProviderText[]>;

  // The texts that the number received at or after the time, oldest first, however many pages the
  // provider holds of them.
  readonly readInbound: (sinceMs: number) => Promise<readonly ProviderText[]>;
  readonly send: (request: TextRequest) => Promise<ProviderSend>;

  // The texts that the number sent to one number with one body in the window. It never sends.
  readonly readSentTexts: (
    query: SentTextQuery,
  ) => Promise<readonly { readonly messageID: string }[]>;
}

export interface PhoneSettings {
  // the assistant's own number
  readonly number: string;
  readonly pollIntervalMs: number;
  readonly wake: WakeRulesConfig;
}

export interface PhoneContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly settings: PhoneSettings;
  readonly logEvent: Logger;
  readonly provider: PhoneProvider;
}

export interface PhoneActionAttempt {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;

  // epoch ms when the attempt began
  readonly attemptStartedAt?: number;
}

export type PhoneProviderResponse =
  | { readonly kind: 'success'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string };

export type PhoneCheckResponse =
  | { readonly kind: 'found'; readonly result: JSONObject }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

// The queue's connector of phone.send, in the shape the actions module runs.
export interface PhoneActionConnector {
  readonly run: (attempt: PhoneActionAttempt) => Promise<PhoneProviderResponse>;
  readonly reconcile: {
    readonly kind: 'check';
    readonly tool: string;
    readonly onNotFound: 'ask';
  };
  readonly check: (attempt: PhoneActionAttempt) => Promise<PhoneCheckResponse>;
}

interface PhoneTextTable {
  readonly text_id: string;
  readonly short_id: string;
  readonly message_id: string;

  // epoch ms
  readonly received_at: number;
  readonly record_sequence: number;
  readonly updated_sequence: number;
}

interface PhoneSendClaimTable {
  readonly action_id: string;
  readonly message_id: string;
  readonly short_id: string;
  readonly updated_sequence: number;
}

export type PhoneTables = CheckedTables<
  Readonly<{ phone_texts: PhoneTextTable; phone_send_claims: PhoneSendClaimTable }>
>;
