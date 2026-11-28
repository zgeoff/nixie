// Long enough for any error a model API or a runner gives, short enough that an HTML error page
// from a proxy cannot fill the reader's context. The log keeps the whole message.
const maxErrorChars = 2000;

// The sentence that a failed run's code-made summary ends with.
export function formatLastError(message: string): string {
  const text =
    message.length > maxErrorChars ? `${message.slice(0, maxErrorChars)} (cut)` : message;

  return `The last error: ${text}`;
}
