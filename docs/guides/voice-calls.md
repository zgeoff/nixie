# Set up voice calls

Give nixie an OpenAI API key for GPT-Live, turn on the `voice` section of its config, and set the
price of a call minute in your definitions. nixie then creates a speech session for each call. The
[calls](../architecture/channels/calls.md) doc covers how a call runs. The
[call screen](https://linear.app/zgeoff/issue/GEO-2863) that starts a call in the app comes later,
so until it ships, only the API starts a call.

## Before you start

- An OpenAI API key with access to GPT-Live. OpenAI serves GPT-Live in the US and the EU only, so a
  host elsewhere gets no calls.
- Your audio goes to OpenAI. OpenAI keeps each call for 30 days for abuse monitoring, as
  [decision 0014](../decisions/0014-voice-pipeline.md#consequences) says.
- A checkout of your definitions repo whose `nixie.yaml` holds `format: 5`.

## Add the key

nixie holds the key in the secrets file and never sends it to a device or to the model. The key
reaches OpenAI only from the host.

1. Open your sops secrets file for editing.
2. Add an entry under `connector_credentials`:

   ```yaml
   connector_credentials:
     speech: <openai_api_key>
   ```

   `<openai_api_key>` is your OpenAI API key.

## Turn on voice

1. Add the `voice` section to your deployment config:

   ```yaml
   voice:
     provider: gpt-live
     credential: deployment:speech
   ```

2. Add `voice/voice.yaml` to your definitions repo, with the price of a minute in dollars:

   ```yaml
   price_per_minute: 0.05
   ```

   nixie has no default price, and a call refuses to start until you set one. Take the figure from
   OpenAI's [GPT-Live model page](https://developers.openai.com/api/docs/models/gpt-live-1).

3. Merge the definitions change. Then restart nixie, which reads the deployment config and the
   secrets file only at start.

Expect: `calls.start` no longer answers `SPEECH_UNAVAILABLE`. When the secrets file has no `speech`
entry, nixie starts anyway, logs `calls.speech_credential_missing`, and keeps answering
`SPEECH_UNAVAILABLE`.

## Change the voice or the lines

In `voice/voice.yaml` in your definitions repo, set the `voice` key to one of OpenAI's voice names,
such as `marin`. Set the holding line, the reconnect line and the other fixed lines in
`voice/lines.yaml`. A changed voice or line applies from the next call.

## When the key stops working

OpenAI refuses a revoked or expired key at the next `calls.connect`, and the call ends as `dropped`.
Replace the `speech` entry in the secrets file and restart nixie.
