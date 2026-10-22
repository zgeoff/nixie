import type { core } from '@pulumi/kubernetes';
import type { Input } from '@pulumi/pulumi';

export interface ServiceShape {
  readonly name: string;
  readonly namespace: Input<string>;
  readonly labels: Record<string, string>;
  readonly port: number;
}

export function buildServiceArgs(shape: ServiceShape): core.v1.ServiceArgs {
  return {
    metadata: {
      name: shape.name,
      namespace: shape.namespace,

      // the StatefulSet updates after the Service it names, so Pulumi's wait for ready pods would
      // hold back the rollout that brings them
      annotations: { 'pulumi.com/skipAwait': 'true' },
    },
    spec: {
      selector: shape.labels,
      ports: [{ name: 'http', port: shape.port, targetPort: 'http' }],
    },
  };
}
