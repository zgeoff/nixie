interface DriveMedia {
  // the content's own MIME type, which Drive converts when the file's type is a Google Doc
  readonly type: string;
  readonly text: string;
}

interface DriveMultipart {
  readonly type: string;
  readonly body: string;
}

// The body of a multipart upload to Drive: the metadata as JSON, then the content. The boundary is
// derived from the marker's key, so a retry builds the same body.
export function buildDriveMultipart(
  metadata: Readonly<Record<string, unknown>>,
  media: DriveMedia,
  boundaryKey: string,
): DriveMultipart {
  const boundary = `nixie-${boundaryKey}`;

  return {
    type: `multipart/related; boundary=${boundary}`,
    body: [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${media.type}; charset=UTF-8`,
      '',
      media.text,
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  };
}
