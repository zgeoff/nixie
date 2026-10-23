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
  readonly web: NixieWebArgs;

  // with none, the component registers no backup
  readonly backup?: NixieBackupArgs;
}

export interface NixieWebArgs {
  // by release tag and digest, from the same release as nixie's image
  readonly image: Input<string>;
}

// A CronJob copies nixie.db and keys.db from the data volume with the deployment's backup script,
// in an image that holds the script's tools.
export interface NixieBackupArgs {
  readonly image: Input<string>;

  // the name of the Secret that pulls the image
  readonly pullSecret: Input<string>;

  // the text of the backup script, which the job runs as `backup.sh backup`
  readonly script: Input<string>;

  // a cron schedule, in the time zone beside it
  readonly schedule: Input<string>;
  readonly timeZone: Input<string>;

  // the job's environment, such as the backup repository and its credentials
  readonly environment: Record<string, Input<string>>;
}

// git-sync follows one ref of a definitions repo on GitHub, over SSH with a read-only deploy key
export interface NixieDefinitionsArgs {
  // as <owner>/<name>
  readonly repository: string;
  readonly ref: Input<string>;
  readonly deployKey: Input<string>;
}
