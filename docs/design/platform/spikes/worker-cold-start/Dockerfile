# The spike's turn image: the conversation image, with or without the worker's code runtimes, plus
# the imp worker spike's turn.ts. Build it from the spikes folder after the conversation image:
#   docker build -f worker-cold-start/Dockerfile --build-arg BASE=<conversation_image> \
#     --build-arg RUNTIMES=yes -t <name> .

ARG BASE=nixie-conversation
FROM ${BASE}
USER root

# The worker image's code environment: Node.js, Python and the toolbox that the sandbox adapter
# design lists. RUNTIMES=no leaves the conversation image as it is, for the comparison.
ARG RUNTIMES=yes
RUN if [ "$RUNTIMES" = yes ]; then \
    apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm python3 python3-pip python3-venv \
      jq ripgrep file less procps findutils gawk sed grep coreutils ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*; \
  fi

# Inside the guest's folder, so the SDK resolves through the guest's own node_modules.
COPY imp-worker-start/turn.ts /app/guests/conversation/spike-turn.ts
USER nixie
