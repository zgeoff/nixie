// The most tokens of one tool result that the conversation guest lets the CLI pass to the model. The
// CLI cuts a longer result to 4 characters a token, and saves any result past 50,000 characters to
// a file the model has no tool to read, so at 12,000 a cut result stays inline.
export const toolOutputLimitTokens = 12_000;
