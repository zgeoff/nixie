// The most image bytes, in base64, that a turn's opening messages carry together, 24 MiB: under the
// 32 MB the Messages API takes in one request, with room for the prompt and the history. A message
// past it waits for the next turn, and the first message always goes.
export const turnImageBudgetBytes = 24 * 1024 * 1024;
