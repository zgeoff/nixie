import type { ModelAPI } from '@heynixie/wire';
import type { ProxyRoute } from '../types';
import { isRecord } from '../utils/is-record';

// The tokens a provider adds to the request's own text: the tool-use system prompt and the framing
// of each message. A text token is never shorter than 1 byte, so the body's byte length plus this
// allowance is an upper bound on the input tokens.
const providerInputAllowanceTokens = 4096;

export type ReplyEstimate =
  | {
      readonly kind: 'bounded';

      // the input and the output bound, which the charge prices by the route's highest rates
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly dollars: number;
      readonly tokens: number;
    }
  | {
      readonly kind: 'unbounded';

      // the request field that left the reply without a bound
      readonly field: string;
    };

export interface ReplyEstimateRequest {
  readonly route: ProxyRoute;
  readonly api: ModelAPI;
  readonly body: unknown;
  readonly byteLength: number;
}

// An upper bound on what a request can cost, with no call to the provider: the body's bytes as
// input tokens and the output limit as output tokens, both at the route's highest rates.
export function buildReplyEstimate(request: ReplyEstimateRequest): ReplyEstimate {
  const unboundedField = findUnboundedInput(request.api, request.body);

  if (unboundedField !== null) {
    return { kind: 'unbounded', field: unboundedField };
  }

  const outputTokens = pickOutputBound(request);

  if (outputTokens === null) {
    return {
      kind: 'unbounded',
      field: request.api === 'anthropic-messages' ? 'max_tokens' : 'max_output_tokens',
    };
  }

  const inputTokens = request.byteLength + providerInputAllowanceTokens;
  const rates = pickHighestRates(request.route);

  return {
    kind: 'bounded',
    inputTokens,
    outputTokens,
    dollars: (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000,
    tokens: inputTokens + outputTokens,
  };
}

function findUnboundedInput(api: ModelAPI, body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  return api === 'anthropic-messages'
    ? findUnboundedMessagesInput(body)
    : findUnboundedResponsesInput(body);
}

function findUnboundedMessagesInput(body: Readonly<Record<string, unknown>>): string | null {
  for (const key of ['mcp_servers', 'container']) {
    if (isPresent(body[key])) {
      return key;
    }
  }

  const messages = Array.isArray(body['messages']) ? body['messages'] : [];

  for (const message of messages) {
    const content = isRecord(message) ? message['content'] : undefined;

    for (const block of collectBlocks(content)) {
      if (hasUnboundedSource(block)) {
        return 'messages.content.source';
      }

      if (
        block['type'] === 'tool_result' &&
        collectBlocks(block['content']).some((inner) => hasUnboundedSource(inner))
      ) {
        return 'messages.content.source';
      }
    }
  }

  return null;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
}

function collectBlocks(content: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(content) ? content.filter((block) => isRecord(block)) : [];
}

const messagesSourceTypesBounded = new Set(['base64', 'text', 'content']);

function hasUnboundedSource(block: Readonly<Record<string, unknown>>): boolean {
  if (block['type'] !== 'image' && block['type'] !== 'document') {
    return false;
  }

  const source = block['source'];

  return (
    isRecord(source) &&
    !(typeof source['type'] === 'string' && messagesSourceTypesBounded.has(source['type']))
  );
}

function findUnboundedResponsesInput(body: Readonly<Record<string, unknown>>): string | null {
  for (const key of ['previous_response_id', 'conversation', 'prompt']) {
    if (isPresent(body[key])) {
      return key;
    }
  }

  const items = Array.isArray(body['input']) ? body['input'] : [];

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    if (item['type'] === 'item_reference') {
      return 'input.item_reference';
    }

    for (const part of [item, ...collectBlocks(item['content'])]) {
      const field = findUnboundedResponsesPart(part);

      if (field !== null) {
        return field;
      }
    }
  }

  return null;
}

function findUnboundedResponsesPart(part: Readonly<Record<string, unknown>>): string | null {
  if (part['type'] !== 'input_image' && part['type'] !== 'input_file') {
    return null;
  }

  if (isPresent(part['file_id'])) {
    return 'input.file_id';
  }

  for (const key of ['image_url', 'file_url']) {
    const value = part[key];

    if (isPresent(value) && !(typeof value === 'string' && /^data:/iu.test(value))) {
      return `input.${key}`;
    }
  }

  return null;
}

function pickOutputBound(request: ReplyEstimateRequest): number | null {
  const key = request.api === 'anthropic-messages' ? 'max_tokens' : 'max_output_tokens';
  const requested = isRecord(request.body) ? request.body[key] : undefined;

  if (typeof requested === 'number' && Number.isInteger(requested) && requested > 0) {
    return requested;
  }

  return request.route.maxOutputTokens;
}

// The highest input-side rate of the route, long prompt rates included, and the highest output rate
export function pickHighestRates(route: ProxyRoute): { input: number; output: number } {
  const prices = route.prices;
  const inputRates = [prices.input, prices.cacheWrite, prices.cacheWrite1h, prices.cachedInput];
  const outputRates = [prices.output];

  if (prices.longPrompt !== undefined) {
    inputRates.push(
      prices.longPrompt.input,
      prices.longPrompt.cacheWrite,
      prices.longPrompt.cacheWrite1h,
      prices.longPrompt.cachedInput,
    );

    outputRates.push(prices.longPrompt.output);
  }

  return { input: Math.max(...inputRates), output: Math.max(...outputRates) };
}
