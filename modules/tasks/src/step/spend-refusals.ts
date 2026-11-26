// The errors that a step raised at the gateway's refusal of its route. A WeakSet holds them by
// identity, so an error that travels through the runner keeps its mark and no wrapper hides its type.
export const spendRefusals = new WeakSet<object>();
