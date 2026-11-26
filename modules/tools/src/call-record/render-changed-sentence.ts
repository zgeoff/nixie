// What a call that the pin or the snapshot moved under reads in place of a result.
export function renderChangedSentence(tool: string): string {
  return `${tool} changed while this call was starting, so nothing ran; call it again`;
}
