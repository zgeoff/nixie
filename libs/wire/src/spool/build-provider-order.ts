// The Anthropic Messages route of the model aggregator takes a provider preference in the body.
// With fallbacks off, the prompt cache stays on the one upstream provider that the pin names. The
// model gateway lets a request carry a provider field in exactly this shape and no other.
export function buildProviderOrder(pin: string): Readonly<Record<string, unknown>> {
  return { provider: { order: [pin], allow_fallbacks: false } };
}
