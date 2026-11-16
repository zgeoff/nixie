export function renderSinceBlock(previousStartedAt: Date, startedAt: Date): string {
  return `<input name="since">Your previous run started at ${previousStartedAt.toISOString()}. This run started at ${startedAt.toISOString()}. Read messages from the first time up to the second.</input>`;
}
