import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { findForwardingProblem } from './find-forwarding-problem.ts';
import { pickProxyImage } from './pick-proxy-image.ts';

// stands in for nixie and the web client, and says which forwarded protocol and host it got
const upstreamConfig = `:8080 {
	respond "proto={http.request.header.X-Forwarded-Proto} host={http.request.header.X-Forwarded-Host}"
}
:3000 {
	respond "web"
}
`;

// The recipe's proxy runs behind the HTTPS proxy of the deployment. Nixie builds the image URLs of a
// device page from the protocol and host that arrive, so the proxy must hand on what it was sent.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-forwarded-proto.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const composeText = await Bun.file('compose.yaml').text();

  const image = pickProxyImage(composeText);

  if (image === null) {
    console.log('::error::compose.yaml has no proxy image');

    process.exitCode = 1;

    return;
  }

  const answer = await readForwardedAnswer(image);

  const problem = findForwardingProblem(answer);

  if (problem !== null) {
    console.log(`::error::${problem}`);

    process.exitCode = 1;
  }
}

async function readForwardedAnswer(image: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-forwarded-proto-'));

  const name = `forwarded-proto-${crypto.randomUUID().slice(0, 8)}`;

  try {
    await writeFile(join(directory, 'upstream.Caddyfile'), upstreamConfig);

    await $`docker network create ${name}`.quiet();
    await $`docker run -d --name ${name}-upstream --network ${name} --network-alias nixie --network-alias web -v ${join(directory, 'upstream.Caddyfile')}:/etc/caddy/Caddyfile:ro ${image}`.quiet();
    await $`docker run -d --name ${name}-proxy --network ${name} -p 127.0.0.1::8080 -v ${join(process.cwd(), 'Caddyfile')}:/etc/caddy/Caddyfile:ro ${image}`.quiet();

    const mapping = await $`docker port ${name}-proxy 8080/tcp`.text();

    const port = mapping.trim().split(':').at(-1);

    return await readAnswer(`http://127.0.0.1:${String(port)}/rpc/probe`);
  } finally {
    await $`docker rm -f ${name}-proxy ${name}-upstream`.nothrow().quiet();
    await $`docker network rm ${name}`.nothrow().quiet();

    await rm(directory, { recursive: true, force: true });
  }
}

// the proxy needs a moment to start, so a refused connection is tried again
async function readAnswer(url: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'nixie.example' },
      });

      return await response.text();
    } catch {
      await Bun.sleep(500);
    }
  }

  return 'no answer';
}

if (import.meta.main) {
  await runCLI();
}
