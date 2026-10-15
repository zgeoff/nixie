import type { SpanState } from '@heynixie/contract';
import { buildSpanState } from '@heynixie/contract';
import type { ClipboardEvent, DragEvent, KeyboardEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { normalizeImage as normalizeInBrowser } from '../normalize-image';
import { css } from '../styled-system/css';
import { useAttachedImages } from '../use-attached-images';
import { usePendingInput } from '../use-pending-input';
import { AttachedImages } from './attached-images';
import { ImagePickers } from './image-pickers';

// What the composer sends: the text with its spans, and the images attached to it, when it has any.
export interface ComposedMessage extends SpanState {
  readonly images?: readonly File[];
}

export interface ComposerProps {
  readonly onSend: (message: ComposedMessage) => void;

  // scales and re-encodes each image you attach; the browser's canvas does it unless a test stands
  // in for it, since the test runtime has no canvas
  readonly normalizeImage?: (image: File) => Promise<File>;
}

const emptyMessage: SpanState = { spans: [], text: '' };

// The message box. It labels every span of the text with how it arrived: beforeinput says how the
// next edit arrives and pins where it lands, and the input event that follows applies it. Images
// come from the pickers, a paste or a drop, and go with the text.
export function Composer(props: ComposerProps): ReactNode {
  const [message, setMessage] = useState<SpanState>(emptyMessage);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const pendingInput = usePendingInput(textBox);
  const attached = useAttachedImages(props.normalizeImage ?? normalizeInBrowser);

  return (
    <form
      className={composer}
      onDragOver={handleDragOver}
      onDrop={(event) => void attached.attach(readDroppedFiles(event))}
      onSubmit={(event) => {
        event.preventDefault();

        // the removed text only labels the next edit, so it stays in the box
        if (message.text.trim() !== '') {
          const images = attached.images.map((image) => image.file);

          props.onSend({ spans: message.spans, text: message.text, ...pickImages(images) });

          setMessage(emptyMessage);

          attached.clear();
        }
      }}
    >
      <AttachedImages images={attached.images} onRemove={attached.remove} />
      {attached.notice === null ? null : <p role="status">{attached.notice}</p>}
      <div className={inputRow}>
        <textarea
          aria-label="Message"
          onChange={(event) => {
            const pending = pendingInput.current;
            const text = event.target.value;

            pendingInput.current = undefined;

            setMessage((current) => buildSpanState(current, pending, text));
          }}
          className={messageBox}
          onKeyDown={handleKeyDown}
          onPaste={(event) => void attached.attach(readPastedFiles(event))}
          ref={textBox}
          rows={3}
          value={message.text}
        />
        <ImagePickers onPick={(files) => void attached.attach(files)} />
        <button className={sendButton} type="submit">
          Send
        </button>
      </div>
    </form>
  );
}

const composer = css({ display: 'flex', flexDirection: 'column', gap: '2' });
const inputRow = css({ alignItems: 'flex-end', display: 'flex', gap: '2' });

const messageBox = css({
  backgroundColor: 'surface',
  borderColor: 'borderStrong',
  borderWidth: '1px',
  flex: '1',
  padding: '2',
  resize: 'vertical',
});

const sendButton = css({
  borderColor: 'borderStrong',
  borderWidth: '1px',
  paddingBlock: '2',
  paddingInline: '4',
});

// a message with no images sends no images field, as a client of an earlier release does
function pickImages(images: readonly File[]): Pick<ComposedMessage, 'images'> {
  return images.length === 0 ? {} : { images };
}

// Enter sends the message, and Shift+Enter starts a new line.
function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

// a drag that carries files may drop on the composer, which takes its images
function handleDragOver(event: DragEvent<HTMLFormElement>): void {
  if (event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
  }
}

// A drop of files attaches them in place of the browser opening them. A drop of text goes on into
// the box, where beforeinput labels it dropped.
function readDroppedFiles(event: DragEvent<HTMLFormElement>): readonly File[] {
  const files = [...event.dataTransfer.files];

  if (files.length > 0) {
    event.preventDefault();
  }

  return files;
}

// A paste of an image with no text, such as a screenshot, attaches the image and leaves the box as
// it was. A paste that carries text too pastes the text as well.
function readPastedFiles(event: ClipboardEvent<HTMLTextAreaElement>): readonly File[] {
  const files = [...event.clipboardData.files];

  if (files.length > 0 && !event.clipboardData.types.includes('text/plain')) {
    event.preventDefault();
  }

  return files;
}
