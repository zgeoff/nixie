import type { ProxyRoute } from '../types';
import { isRecord } from '../utils/is-record';

// the fields that let OpenRouter bill a model other than the route's model
const routingFields = ['models', 'fallbacks', 'route', 'plugins'] as const;

// The values of each field that bill no more than a body without it. Both model APIs treat an
// absent service_tier as auto, so an explicit auto or null asks for nothing that omitting it would
// not.
const standardValues: Readonly<
  Record<'speed' | 'service_tier' | 'inference_geo', readonly unknown[]>
> = {
  speed: ['standard', null],
  service_tier: ['auto', 'standard_only', 'default', null],
  inference_geo: ['global', null],
};

// The refusal of a body that could bill more than the route's model at the route's prices, or null
// for a body that cannot. It reads the body's own fields and the entries of its tools, never a
// message or a tool's input, which can hold any key.
export function findBodyRefusal(
  body: Readonly<Record<string, unknown>>,
  route: ProxyRoute,
): string | null {
  const field = routingFields.find((name) => Object.hasOwn(body, name));

  if (field !== undefined) {
    return `the model gateway counts only ${route.model}, so it refuses a request that sets ${field}`;
  }

  if (Object.hasOwn(body, 'provider') && !isPinnedProvider(body['provider'], route.providerPin)) {
    return `the model gateway allows provider only as the route's pin with fallbacks off, so it refuses this provider`;
  }

  for (const name of ['speed', 'service_tier', 'inference_geo'] as const) {
    if (Object.hasOwn(body, name) && !standardValues[name].includes(body[name])) {
      return `the model gateway prices only the standard ${name}, so it refuses this ${name}`;
    }
  }

  const tools = body['tools'];

  if (Array.isArray(tools) && !tools.every((tool) => isClientTool(tool))) {
    return 'the model gateway counts only tokens of its own model, so it refuses a tool that the model API runs';
  }

  return null;
}

function isPinnedProvider(provider: unknown, pin: string | null): boolean {
  if (pin === null || !isRecord(provider)) {
    return false;
  }

  const order = provider['order'];

  return (
    Object.keys(provider).length === 2 &&
    Array.isArray(order) &&
    order.length === 1 &&
    order[0] === pin &&
    provider['allow_fallbacks'] === false
  );
}

// The types of a tool that the caller runs. Every other type, such as a web search or an image
// generation, is a tool that the model API runs and bills apart from the tokens, often on a second
// model.
const clientToolTypes: ReadonlySet<unknown> = new Set([undefined, 'custom', 'function']);

function isClientTool(tool: unknown): boolean {
  if (!isRecord(tool) || Object.hasOwn(tool, 'model')) {
    return false;
  }

  const type = tool['type'];

  if (type === 'namespace') {
    const inner = tool['tools'];

    return Array.isArray(inner) && inner.every((entry) => isClientTool(entry));
  }

  return clientToolTypes.has(type);
}
