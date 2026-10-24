#!/usr/bin/env bash
# Downloads the speech models the spike runs into models/. Smart Turn comes from Pipecat's Hugging
# Face repository and each archive from the sherpa-onnx release assets, about 1.7 GB unpacked in all.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p models
cd models
base=https://github.com/k2-fsa/sherpa-onnx/releases/download
curl -sfLO "$base/asr-models/silero_vad.onnx"
curl -sfLO https://huggingface.co/pipecat-ai/smart-turn-v3/resolve/main/smart-turn-v3.2-cpu.onnx
for archive in \
  asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26 \
  asr-models/sherpa-onnx-moonshine-base-en-int8 \
  asr-models/sherpa-onnx-whisper-base.en \
  tts-models/vits-piper-en_US-lessac-medium \
  tts-models/vits-piper-en_US-ryan-medium \
  tts-models/kokoro-en-v0_19 \
  tts-models/kokoro-int8-en-v0_19; do
  curl -sfL "$base/$archive.tar.bz2" | tar xj
done
