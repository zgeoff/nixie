// The input of the model's last request must hold the text the journey waits for.
export function pickModelInputRefusal(text: string, contains: string): string | null {
  return text.includes(contains)
    ? null
    : `the model's last input lacks ${JSON.stringify(contains)}; it is ${text}`;
}
