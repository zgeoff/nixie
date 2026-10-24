# Spike: worker cold start on the worker image

This spike times a fresh worker on the worker image, which adds Node.js, Python and a toolbox to the
conversation image, and a fresh fetch sandbox. It checks the 2.5 to 3 s to first text in decision
[0003](../../docs/decisions/0003-sdk-placement.md) against the images in the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md#images).

## Question

How long do imp creation and first text take for a fresh worker on the worker image, does the worker
image need to be smaller than it is, and is one fetch sandbox per fetch affordable?

## Answer

- The code runtimes add about 480 MB to the image and no start time that 10 samples can see.
- From a cold page cache, a worker turn reached its first text in a median of 2.6 s on the worker
  image and 3.0 s on the conversation image, both inside the spread.
- The image does not enter an imp create's path, so the 472 ms create from the
  [imp worker spike](../imp-worker-start/README.md) holds for the worker image.
- A fresh fetch sandbox adds about 0.5 to 0.9 s before its reply against a fetcher in a long-lived
  sandbox, under one model call of 1.2 to 1.5 s.

Ship one worker image with the code runtimes, and start one fetch sandbox per fetch.

## Run it

Run as root in an imp guest that has Docker and imp's broker, from this folder.

```bash
bash run.sh
SPIKE_PHASES=fetch bash run.sh
```

The [setup](results.md#setup) gives the versions, the images and the phases.

## Results

The [results](results.md) hold the turn, image and fetch tables, and the recorded run sits in the
[results folder](results/).

## Untested

A real imp create from either image, since the spike ran in Docker inside an imp guest without KVM.
The [untested list](results.md#untested) gives the rest.
