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

// A CronJob ships the backup sets that nixie stages on its data volume to the data and key repos.
export interface NixieBackupArgs {
  // by release tag and digest; with none, the nixie-backup image of the component's own release
  readonly image?: Input<string>;

  // the name of the Secret that pulls the image
  readonly pullSecret: Input<string>;

  // a script of the deployment's own, which the job runs as `backup.sh backup` on the whole data
  // volume in place of the image's job; with none, the image's job ships the staged sets
  readonly script?: Input<string>;

  // a cron schedule, in the time zone beside it; every 5 minutes in UTC by default, so a forget's
  // key set ships within minutes
  readonly schedule?: Input<string>;
  readonly timeZone?: Input<string>;

  // the job's environment: each repo and its password, as NIXIE_BACKUP_DATA_REPOSITORY,
  // NIXIE_BACKUP_DATA_PASSWORD, NIXIE_BACKUP_KEY_REPOSITORY and NIXIE_BACKUP_KEY_PASSWORD, and the
  // backend's credentials
  readonly environment: Record<string, Input<string>>;
}

// git-sync follows one ref of a definitions repo on GitHub, over SSH with a read-only deploy key
export interface NixieDefinitionsArgs {
  // as <owner>/<name>
  readonly repository: string;
  readonly ref: Input<string>;
  readonly deployKey: Input<string>;
}
