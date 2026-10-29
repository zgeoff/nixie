import type { Input } from '@pulumi/pulumi';

export function pickBackupImage(
  named: Input<string> | undefined,
  released: string | null,
): Input<string> {
  if (named !== undefined) {
    return named;
  }

  if (released === null) {
    throw new Error(
      'this build of the component carries no nixie-backup image, so backup.image names one',
    );
  }

  return released;
}
