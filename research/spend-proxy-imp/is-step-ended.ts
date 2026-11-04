interface ThreadPage {
  readonly lastStepEnd?: { readonly sequence: number } | null;
}

export function isStepEnded(page: ThreadPage, afterSequence: number): boolean {
  return (page.lastStepEnd?.sequence ?? 0) > afterSequence;
}
