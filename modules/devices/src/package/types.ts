export interface DevicePackage {
  readonly name: string;
  readonly version: string;

  // the registry's sha512, as `sha512-<base64>`
  readonly integrity: string;
  readonly unpackedBytes: number;
  readonly publisher: string;

  // the path of each file of the package, which is all the server serves of it
  readonly files: readonly string[];
  readonly addedSequence: number;
}

// What the registry says about one version of a package, which an approval binds.
export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly integrity: string;

  // null when the registry leaves the size out
  readonly unpackedBytes: number | null;
  readonly publisher: string;
  readonly description: string;
}
