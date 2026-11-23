// Text that a page or the model supplied, inside the markers that a page read shows. The text is
// written as a JSON string, as a page read escapes it, so no text can write a closing marker.
export function renderUntrustedText(text: string, mint: () => string): string[] {
  const fence = mint();

  return [
    `<tool-result source="untrusted" fence="${fence}">`,
    JSON.stringify(text),
    `</tool-result fence="${fence}">`,
  ];
}
