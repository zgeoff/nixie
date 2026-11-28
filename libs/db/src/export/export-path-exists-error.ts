export class ExportPathExistsError extends Error {
  override readonly name = 'ExportPathExistsError';

  readonly code = 'EXPORT_PATH_EXISTS';

  constructor(path: string) {
    super(`${path} exists, and nixie never overwrites a file`);
  }
}
