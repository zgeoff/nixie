#!/bin/sh
# Installs the spike's packages in a fresh Ubuntu 24.04 imp, with this folder copied to /root/spike.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends xvfb x11vnc openbox xterm xdotool tigervnc-viewer procps ca-certificates fonts-liberation unzip curl > /dev/null
curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/bun bash -s bun-v1.4.4 > /dev/null 2>&1
ln -sf /opt/bun/bin/bun /usr/local/bin/bun
cd /root/spike
bun install > /dev/null
PLAYWRIGHT_BROWSERS_PATH=/opt/browsers bun node_modules/playwright-core/cli.js install --with-deps chromium chromium-headless-shell > /dev/null 2>&1
echo "setup done"
