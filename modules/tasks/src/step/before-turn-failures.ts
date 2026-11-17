// The errors that a step raised before its model turn. A WeakSet holds them by identity, so an error
// that travels through the runner keeps its mark and no wrapper hides its type.
export const beforeTurnFailures = new WeakSet<object>();
