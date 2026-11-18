import { imageLimits } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { SentFileActivity } from '../conversation/build-activity';
import { formatFileSize } from '../conversation/format-file-size';
import { css } from '../styled-system/css';
import { useBlobURL } from '../utils/use-blob-url';
import { useNixieClient } from '../utils/use-nixie-client';
import { writeBlobDownload } from '../utils/write-blob-download';
import { ImageViewer } from './image-viewer';

export interface SentFileProps {
  readonly file: SentFileActivity;
}

const inlineTypes: readonly string[] = imageLimits.mediaTypes;

const wrapper = css({
  alignItems: 'flex-start',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
});

const caption = css({ color: 'textMuted', fontSize: 'sm', whiteSpace: 'pre-wrap' });

// A file that nixie sent under its reply: an image of a type that nixie sniffed from the bytes
// shows inline, and any other file is a chip that downloads. The bytes stay a blob in the page,
// and the page never navigates to them.
export function SentFile(props: SentFileProps): ReactNode {
  const file = props.file;
  const label = `${file.name} · ${formatFileSize(file.bytes)}`;

  return (
    <li className={wrapper}>
      {inlineTypes.includes(file.mediaType) ? (
        <InlineImage file={file} label={label} />
      ) : (
        <DownloadChip file={file} label={label} />
      )}
      {file.caption === undefined ? null : <p className={caption}>{file.caption}</p>}
    </li>
  );
}

interface FileViewProps {
  readonly file: SentFileActivity;
  readonly label: string;
}

const inlineImage = css({
  borderColor: 'border',
  borderWidth: '1px',
  cursor: 'zoom-in',
  maxHeight: '96',
  maxWidth: 'full',
  objectFit: 'contain',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });

function InlineImage(props: FileViewProps): ReactNode {
  const nixie = useNixieClient();
  const [isOpen, setIsOpen] = useState(false);

  const read = useQuery({
    ...nixie.queryUtils.files.read.queryOptions({ input: { file: props.file.file } }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const url = useBlobURL(read.data);

  if (read.isError) {
    return <span className={muted}>{`${props.label} · ${describeFailure(read.error)}`}</span>;
  }

  if (url === null) {
    return <span className={muted}>{`${props.label} · Loading…`}</span>;
  }

  return (
    <>
      <button
        aria-label={`Open ${props.file.name} full size`}
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        <img alt={props.file.name} className={inlineImage} src={url} />
      </button>
      <span className={muted}>{props.label}</span>
      {isOpen ? (
        <ImageViewer
          alt={props.file.name}
          onClose={() => {
            setIsOpen(false);
          }}
          source={url}
        />
      ) : null}
    </>
  );
}

function describeFailure(error: unknown): string {
  return error instanceof ORPCError && error.code === 'FILE_FORGOTTEN'
    ? 'Forgotten'
    : 'Unavailable';
}

function DownloadChip(props: FileViewProps): ReactNode {
  const nixie = useNixieClient();

  const download = useMutation({
    mutationFn: async () => {
      const blob = await nixie.client.files.read({ file: props.file.file });

      writeBlobDownload(blob, props.file.name);
    },
  });

  if (download.isError) {
    return <span className={muted}>{`${props.label} · ${describeFailure(download.error)}`}</span>;
  }

  return (
    <button
      disabled={download.isPending}
      onClick={() => {
        download.mutate();
      }}
      type="button"
    >
      {props.label}
    </button>
  );
}
