import type { RuleCall } from '../types';
import { maxInputDepth, maxInputListElements, maxInputStringUnits } from './constants';

export type ConditionContext =
  | { readonly status: 'ok'; readonly context: Record<string, unknown> }
  | { readonly status: 'too_large' };

class InputTooLargeError extends Error {
  override readonly name = 'InputTooLargeError';
}

interface Budget {
  stringUnits: number;
}

// What a condition reads, built from the call and nothing else. Content arguments are left out, an
// integral number becomes an int and any other a double, and every string is in NFC.
export function buildConditionContext(call: RuleCall): ConditionContext {
  const budget: Budget = { stringUnits: 0 };

  try {
    const content = new Set(call.contentArgs);

    if (Object.keys(call.args).length > maxInputListElements) {
      throw new InputTooLargeError();
    }

    const args = Object.fromEntries(
      Object.entries(call.args)
        .filter(([name]) => !content.has(name))
        .map(([name, value]) => [convertText(name, budget), convertValue(value, budget, 1)]),
    );

    return {
      status: 'ok',
      context: {
        tool: convertText(call.tool, budget),
        effects: convertList(call.effects, budget),
        context: call.context,
        definition: convertText(call.task ?? '', budget),
        args,
        destinations: convertList(call.destinations, budget),
        sources: convertList(call.sources, budget),
        now: new Date(call.at),
      },
    };
  } catch (error) {
    if (error instanceof InputTooLargeError) {
      return { status: 'too_large' };
    }

    throw error;
  }
}

function convertText(text: string, budget: Budget): string {
  budget.stringUnits += text.length;

  if (budget.stringUnits > maxInputStringUnits) {
    throw new InputTooLargeError();
  }

  return text.normalize('NFC');
}

const int64Limit = 2 ** 63;

function convertValue(value: unknown, budget: Budget, depth: number): unknown {
  if (depth > maxInputDepth) {
    throw new InputTooLargeError();
  }

  if (typeof value === 'string') {
    return convertText(value, budget);
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) && Math.abs(value) < int64Limit ? BigInt(value) : value;
  }

  if (Array.isArray(value)) {
    if (value.length > maxInputListElements) {
      throw new InputTooLargeError();
    }

    return value.map((item: unknown) => convertValue(item, budget, depth + 1));
  }

  if (typeof value === 'object' && value !== null) {
    if (Object.keys(value).length > maxInputListElements) {
      throw new InputTooLargeError();
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        convertText(key, budget),
        convertValue(item, budget, depth + 1),
      ]),
    );
  }

  return value;
}

function convertList(items: readonly string[], budget: Budget): string[] {
  if (items.length > maxInputListElements) {
    throw new InputTooLargeError();
  }

  return items.map((item) => convertText(item, budget));
}
