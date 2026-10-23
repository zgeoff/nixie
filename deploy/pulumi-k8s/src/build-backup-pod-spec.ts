import type { types } from '@pulumi/kubernetes';
import type { Input } from '@pulumi/pulumi';

export interface BackupPodInputs {
  readonly image: Input<string>;
  readonly claim: string;
  readonly scriptConfigMap: string;
  readonly envSecret: string;
  readonly pullSecret: Input<string>;
}

export function buildBackupPodSpec(inputs: BackupPodInputs): types.input.core.v1.PodSpec {
  return {
    restartPolicy: 'OnFailure',

    // nixie's own user, so a restore leaves files nixie can open
    securityContext: {
      runAsNonRoot: true,
      runAsUser: 10_001,
      runAsGroup: 10_001,
      fsGroup: 10_001,
      seccompProfile: { type: 'RuntimeDefault' },
    },
    automountServiceAccountToken: false,
    imagePullSecrets: [{ name: inputs.pullSecret }],
    containers: [
      {
        name: 'backup',
        image: inputs.image,

        // the script runs in place of the image's own entrypoint
        command: ['/bin/sh', '/opt/nixie-backup/backup.sh'],
        args: ['backup'],
        env: [
          { name: 'STATE_DIR', value: '/state' },
          { name: 'HOME', value: '/tmp' },
        ],
        envFrom: [{ secretRef: { name: inputs.envSecret } }],
        volumeMounts: [
          { name: 'state', mountPath: '/state' },
          { name: 'script', mountPath: '/opt/nixie-backup', readOnly: true },
          { name: 'tmp', mountPath: '/tmp' },
        ],
        resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '256Mi' } },
        securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } },
      },
    ],
    volumes: [
      { name: 'state', persistentVolumeClaim: { claimName: inputs.claim } },
      { name: 'script', configMap: { name: inputs.scriptConfigMap } },
      { name: 'tmp', emptyDir: {} },
    ],
  };
}
