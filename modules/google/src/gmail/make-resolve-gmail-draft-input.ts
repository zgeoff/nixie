import type { JSONObject } from '@heynixie/log';
import type { InputResolution, ToolResolveContext } from '@heynixie/tools';
import { buildFailureRefusal, forgottenOutcome } from '../call/build-google-failure';
import { buildDraftDigest } from './build-draft-digest';
import { makeResolveGmailInput } from './make-resolve-gmail-input';
import { parseItemID } from './parse-item-id';
import { readCallContext } from './read-call-context';
import { readGmailDraft } from './read-gmail-draft';
import { readGmailRaw } from './read-gmail-raw';
import type { GmailDeps } from './types';

// Names the connection of a draft's send, then adds the digest of the draft as it stands, so the
// decision, the action hash and the queued action all cover what the draft holds now.
export function makeResolveGmailDraftInput(
  deps: GmailDeps,
): (input: JSONObject, context: ToolResolveContext) => Promise<InputResolution> {
  const resolveConnection = makeResolveGmailInput(deps.access);

  return async (input, toolContext) => {
    const resolved = await resolveConnection(input, toolContext);

    if (resolved.status === 'error') {
      return resolved;
    }

    const draft = resolved.input['draft'];
    const draftText = typeof draft === 'string' ? draft : '';
    const item = parseItemID(draftText);

    const context = await readCallContext(deps.access, resolved.input);

    if (item === null || context === null) {
      return forgottenOutcome;
    }

    const read = await readGmailDraft(deps.hosts, context, item.id);

    if (read.kind !== 'draft') {
      return read.kind === 'missing'
        ? { status: 'error', message: `UNKNOWN_DRAFT: no draft has the ID ${draftText}` }
        : buildFailureRefusal(read.failure, deps.clock);
    }

    const raw = await readGmailRaw(deps.hosts, context, read.message.id);

    return raw.kind === 'raw'
      ? { status: 'ok', input: { ...resolved.input, digest: buildDraftDigest(raw.text) } }
      : buildFailureRefusal(raw.failure, deps.clock);
  };
}
