import type { Input } from '@pulumi/pulumi';

export interface NixieArgs {
  readonly namespace: Input<string>;

  // by release tag and digest
  readonly image: Input<string>;

  // the text of nixie's config.yaml
  readonly config: Input<string>;

  // the sops-encrypted secrets.yaml, and the host's age identity that decrypts it
  readonly secretsFile: Input<string>;
  readonly ageKey: Input<string>;
  readonly definitions: NixieDefinitionsArgs;

  // the class of the data volume, which holds nixie.db and keys.db
  readonly storageClassName: Input<string>;
}

// git-sync follows one ref of a definitions repo on GitHub, over SSH with a read-only deploy key
export interface NixieDefinitionsArgs {
  // as <owner>/<name>
  readonly repository: string;
  readonly ref: Input<string>;
  readonly deployKey: Input<string>;
}
