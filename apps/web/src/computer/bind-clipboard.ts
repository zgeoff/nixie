export interface ClipboardBinding {
  // called with the text of a paste that the user makes in the element
  readonly onPaste: (text: string) => void;
}

// The viewer would send a paste chord as a plain key before the text reaches the desktop, so the
// chord is held back and the paste event, which carries the text, sends both. The page never reads
// the clipboard on its own. It returns the function that removes the listeners.
export function bindClipboard(target: HTMLElement, binding: ClipboardBinding): () => void {
  const passPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text/plain') ?? '';

    if (text === '') {
      return;
    }

    event.preventDefault();
    binding.onPaste(text);
  };

  target.addEventListener('keydown', holdBackChord, true);
  target.addEventListener('keyup', holdBackChord, true);
  target.addEventListener('paste', passPaste);

  return () => {
    target.removeEventListener('keydown', holdBackChord, true);
    target.removeEventListener('keyup', holdBackChord, true);
    target.removeEventListener('paste', passPaste);
  };
}

function holdBackChord(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    event.stopPropagation();
  }
}
