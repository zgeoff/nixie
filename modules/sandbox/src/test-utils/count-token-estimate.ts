// A rough count of the tokens in a text, at about 4 characters to a token, which the stub guest's
// context size grows by.
export function countTokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}
