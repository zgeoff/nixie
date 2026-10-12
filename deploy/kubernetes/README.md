# Kubernetes reference manifests

The manifests here run nixie on Kubernetes: nixie as a StatefulSet of one replica on a
`ReadWriteOnce` volume, the web client as a Deployment, one ingress that sends `/rpc` to nixie, the
configuration as a ConfigMap and the secrets as a read-only Secret. Each image is named by its
release tag and digest. impd runs on the node, outside the cluster.
[Kubernetes](../../docs/architecture/deployment/kubernetes.md) explains the shape.

## Use them

1. Copy this folder into your deployment repo.
2. Replace every placeholder: the host name in `ingress.yaml`, and impd's URL, the node's addresses,
   the cluster's pod and service ranges and the model profiles in `config.yaml`.
3. Replace the `nixie-definitions` ConfigMap with your own persona, or with your definitions source.
4. Create the namespace, the TLS Secret `nixie-tls`, and the `nixie-secrets` Secret from your sops
   file and your host's age key, as `secret.example.yaml` shows. `kustomization.yaml` leaves that
   example out, so applying the folder never replaces a real Secret.
5. Apply the folder as a kustomization with your cluster's client.

## Check them

To validate every resource against the Kubernetes schemas, render the folder with kustomize and run
kubeconform:

```bash
kustomize build deploy/kubernetes > /tmp/nixie.yaml
kubeconform -strict -summary /tmp/nixie.yaml deploy/kubernetes/secret.example.yaml
```

Expect `Valid: 10, Invalid: 0, Errors: 0`.
