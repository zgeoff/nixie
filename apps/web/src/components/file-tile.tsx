import { imageLimits } from '@heynixie/contract';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { formatFileSize } from '../conversation/format-file-size';
import { css } from '../styled-system/css';
import { useBlobURL } from '../utils/use-blob-url';
import { useIsSeen } from '../utils/use-is-seen';
import { useNixieClient } from '../utils/use-nixie-client';
import { writeBlobDownload } from '../utils/write-blob-download';
import { ForgetControl } from './forget-control';
import { ImageViewer } from './image-viewer';

export interface FileTileProps {
  readonly file: {
    readonly file: string;
    readonly name: string;
    readonly bytes: number;
    readonly mediaType: string;
    readonly recordedAt: Date;
    readonly thread: string;
    readonly sequence: number;
    readonly isSent: boolean;
    readonly runFileCount: number;
    readonly taskID: string | null;
    readonly taskName: string | null;
  };

  readonly onRunForgotten: () => void;
}

const inlineTypes: readonly string[] = imageLimits.mediaTypes;

const tile = css({
  borderColor: 'border',
  borderWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  padding: '2',
});

const preview = css({
  alignItems: 'center',
  backgroundColor: 'canvas',
  display: 'flex',
  height: '32',
  justifyContent: 'center',
  overflow: 'hidden',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });
const name = css({ fontWeight: 'semibold', overflowWrap: 'anywhere' });
const link = css({ color: 'link', textDecoration: 'underline' });

// One file of a code run: an image shows a thumbnail once the tile scrolls into view, and any other
// file shows its name, type and size. The bytes stay a blob in the page, and the page never
// navigates to them.
export function FileTile(props: FileTileProps): ReactNode {
  const file = props.file;
  const ref = useRef<HTMLLIElement>(null);
  const isSeen = useIsSeen(ref);
  const taskLabel = file.taskID === null ? 'Conversation' : (file.taskName ?? file.taskID);
  const taskTo = file.taskID === null ? '/' : `/tasks/${encodeURIComponent(file.taskID)}`;

  return (
    <li className={tile} ref={ref}>
      {inlineTypes.includes(file.mediaType) ? (
        <div className={preview}>
          <Thumbnail file={file} isSeen={isSeen} />
        </div>
      ) : null}
      <span className={name}>{file.name}</span>
      <span className={muted}>
        {describeMediaType(file.mediaType)} · {formatFileSize(file.bytes)}
      </span>
      <time className={muted} dateTime={file.recordedAt.toISOString()}>
        {file.recordedAt.toLocaleString()}
      </time>
      <Link className={link} to={taskTo}>
        {taskLabel}
      </Link>
      {file.isSent ? <span className={muted}>Sent to you</span> : null}
      <DownloadButton file={file} />
      <p className={muted}>
        Forgetting a file forgets the whole code run: its output and all {file.runFileCount} of its
        files.
      </p>
      <ForgetControl
        hasText
        kind="tool_result"
        label="Forget"
        onForgotten={props.onRunForgotten}
        onOpenChange={() => {}}
        sequence={file.sequence}
        thread={file.thread}
      />
    </li>
  );
}

interface ThumbnailProps {
  readonly file: FileTileProps['file'];
  readonly isSeen: boolean;
}

const thumbnail = css({
  cursor: 'zoom-in',
  maxHeight: 'full',
  maxWidth: 'full',
  objectFit: 'contain',
});

function Thumbnail(props: ThumbnailProps): ReactNode {
  const nixie = useNixieClient();
  const [isOpen, setIsOpen] = useState(false);

  const read = useQuery({
    ...nixie.queryUtils.files.read.queryOptions({ input: { file: props.file.file } }),
    enabled: props.isSeen,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const url = useBlobURL(read.data);

  if (read.isError) {
    return <span className={muted}>Unavailable</span>;
  }

  if (url === null) {
    return <span className={muted}>Loading…</span>;
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
        <img alt={props.file.name} className={thumbnail} src={url} />
      </button>
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

// The short label of a media type: the part after the slash, such as csv for text/csv.
function describeMediaType(mediaType: string): string {
  const subtype = mediaType.split('/').at(1) ?? mediaType;

  return subtype.split('+').at(0) ?? subtype;
}

interface DownloadButtonProps {
  readonly file: FileTileProps['file'];
}

function DownloadButton(props: DownloadButtonProps): ReactNode {
  const nixie = useNixieClient();

  const download = useMutation({
    mutationFn: async () => {
      const blob = await nixie.client.files.read({ file: props.file.file });

      writeBlobDownload(blob, props.file.name);
    },
  });

  return (
    <>
      <button
        aria-label={`Download ${props.file.name}`}
        disabled={download.isPending}
        onClick={() => {
          download.mutate();
        }}
        type="button"
      >
        Download
      </button>
      {download.isError ? <span className={muted}>The download did not finish.</span> : null}
    </>
  );
}
