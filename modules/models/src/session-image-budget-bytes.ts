// The most image bytes, in base64, that one session holds: the SDK repeats every image a session
// took in each later request, which the Messages API caps at 32 MB with the prompt and the history,
// so a message whose images pass it waits for a rebuilt session.
export const sessionImageBudgetBytes = 24 * 1024 * 1024;
