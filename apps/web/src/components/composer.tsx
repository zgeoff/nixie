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

export interface ComposedMessage extends SpanState {
  readonly images?: readonly File[];
}

export interface ComposerProps {
  readonly onSend: (message: ComposedMessage) => void;

  readonly normalizeImage?: (image: File) => Promise<File>;
}

const emptyMessage: SpanState = { spans: [], text: '' };
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

        // The browser submits on Enter even while the send button is disabled, so this check repeats
        // the button's wait for an image that still scales.
        if (message.text.trim() !== '' && !attached.isPending) {
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
        <button className={sendButton} disabled={attached.isPending} type="submit">
          Send
        </button>
      </div>
    </form>
  );
}

function handleDragOver(event: DragEvent<HTMLFormElement>): void {
  if (event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
  }
}

function readDroppedFiles(event: DragEvent<HTMLFormElement>): readonly File[] {
  const files = [...event.dataTransfer.files];

  if (files.length > 0) {
    event.preventDefault();
  }

  return files;
}

function pickImages(images: readonly File[]): Pick<ComposedMessage, 'images'> {
  return images.length === 0 ? {} : { images };
}

function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function readPastedFiles(event: ClipboardEvent<HTMLTextAreaElement>): readonly File[] {
  const files = [...event.clipboardData.files];

  if (files.length > 0 && !event.clipboardData.types.includes('text/plain')) {
    event.preventDefault();
  }

  return files;
}
