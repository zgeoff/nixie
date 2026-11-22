import type { ReactNode } from 'react';
import { NoteStoredImage } from './note-stored-image';
import { ReplyText } from './reply-text';

export interface NoteBodyProps {
  readonly text: string;
}

// A body renders as a reply does: no raw HTML, safe links only, and an image that is not a stored
// one renders as a link, so opening a note never calls out to a fetched page's image host.
export function NoteBody(props: NoteBodyProps): ReactNode {
  return (
    <ReplyText
      renderStoredImage={(image, alt) => <NoteStoredImage alt={alt} image={image} />}
      text={props.text}
    />
  );
}
