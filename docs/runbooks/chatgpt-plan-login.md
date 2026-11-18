# Run Codex tasks on a ChatGPT plan login

Use this runbook to let a task on the
[Codex harness](../architecture/core/model-profiles.md#harnesses) spend a ChatGPT plan in place of
an OpenAI API key.

The [model gateway](../architecture/policy/model-gateway.md) is the process on the host that counts
every model request. It holds the plan's login on a route of its own, the plan route, and adds the
plan's token to each plan request itself. Neither the nixie server nor a sandbox ever holds that
token, so no plan request can skip the gateway's count.
[The plan route](../architecture/policy/model-gateway.md#the-plan-route) explains the path of a
request.

Two people take part:

- The operator runs the commands on the host that runs the gateway.
- The account holder signs in to the ChatGPT account and approves the sign-in code. The account
  holder can be the operator.

## Before you start

Check that both configs have the sections the plan route needs. When one lacks a section, set it up
first with the doc that the item links.

- nixie's `config.yaml` has a `spendStop` section. With it, nixie sends every model request through
  the gateway and reads the gateway's status
  ([how nixie uses the gateway](../architecture/policy/model-gateway.md#how-nixie-uses-the-gateway)).
- The gateway's config has a `periods` section, which holds the day and month dollar limits, and a
  `control` section ([the periods](../architecture/policy/model-gateway.md#the-periods)). nixie
  reads the plan login's status from the control listener, the gateway's second address, which only
  the nixie server calls.

## Placeholders

| Placeholder                                                                  | What it stands for                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<gateway_host>`                                                             | the host that runs the model gateway                                                                                                                                               |
| `<gateway_user>`                                                             | the system user that the gateway's service runs as                                                                                                                                 |
| `<config_file>`                                                              | the gateway's config file                                                                                                                                                          |
| `<route>`                                                                    | the plan route's ID, which is also the ID of the model profile that uses it                                                                                                        |
| `<route_key_file>`                                                           | a file on `<gateway_host>` for the route key, such as `/run/secrets/<route>-route-key`                                                                                             |
| `<login_file>`                                                               | the file where the gateway keeps the login, such as `/var/lib/model-gateway/logins/<route>.json`                                                                                   |
| `<model>`                                                                    | the Codex model ID, such as `gpt-6-luna`                                                                                                                                           |
| `<input>`, `<cache_write>`, `<cache_write_1h>`, `<cached_input>`, `<output>` | OpenAI's API price for `<model>`, in US dollars per million tokens, for each class of token in [a price table](../architecture/core/model-profiles.md#prices-and-the-provider-pin) |
| `<max_output_tokens>`                                                        | the model's largest output in tokens, which the gateway assumes for a request with no `max_output_tokens` ([the estimate](../architecture/policy/model-gateway.md#the-estimate))   |
| `<control_address>`                                                          | the `hostname:port` of `control.listen` in `<config_file>`                                                                                                                         |
| `<control_token>`                                                            | the token in the file that `control.tokenFile` in `<config_file>` names                                                                                                            |
| `<impd_url>`                                                                 | the URL of impd, the daemon that runs each sandbox: `imp.url` in nixie's `config.yaml`                                                                                             |
| `<impd_root_token>`                                                          | an impd token that can add a secret for the whole host                                                                                                                             |
| `<secret_name>`                                                              | the name that step 4 of [Set up the plan route](#set-up-the-plan-route) prints                                                                                                     |
| `<model_url>`                                                                | the gateway's model listener: `spendStop.modelURL` in nixie's `config.yaml`                                                                                                        |

## Read the route's status

Run this on `<gateway_host>` at any point:

```bash
curl -s -H "Authorization: Bearer <control_token>" http://<control_address>/chatgpt-logins
```

Expect: one entry per plan route, with its `status` of `active`, `failing` or `needs_login`. The
answer holds no token and no email.

## Set up the plan route

1. On `<gateway_host>`, make the route key. Only a sandbox that nixie grants the plan profile sends
   this key, and the gateway refuses a plan request without it.

   ```bash
   openssl rand -hex 32 > <route_key_file>
   chown <gateway_user> <route_key_file>
   chmod 600 <route_key_file>
   ```

   Keep the key out of any log or chat.

2. Make the login file's folder, readable by the gateway's user only:

   ```bash
   install -d -o <gateway_user> -m 700 "$(dirname <login_file>)"
   ```

   The login command writes `<login_file>` itself, with mode 600.

3. Add the route under `routes` in `<config_file>`:

   ```yaml
   routes:
     <route>:
       api: openai-responses
       upstream: https://chatgpt.com/backend-api/codex
       model: <model>
       maxOutputTokens: <max_output_tokens>
       prices:
         input: <input>
         cache_write: <cache_write>
         cache_write_1h: <cache_write_1h>
         cached_input: <cached_input>
         output: <output>
       login:
         file: <login_file>
         routeKeyFile: <route_key_file>
   ```

   A plan has no price per token, but Codex use past the plan's own limit draws on credits bought
   for the account. The gateway counts each plan request at these prices against the dollar limits
   in `periods`, so those limits cap that spend. The count therefore shows more than the plan itself
   costs.

4. Print the name that nixie gives the plan profile's model secret:

   ```bash
   printf '<route>\nbearer\nchatgpt.com' | sha256sum | cut -c1-19 | sed 's/^/nixie-model-/'
   ```

   Expect: one line that starts with `nixie-model-`. nixie looks the secret up under this name, and
   refuses to create a sandbox for the profile when impd lacks it
   ([model secrets](../architecture/deployment/impd-names.md#model-secrets)).

5. Add the route key to impd as the secret `<secret_name>`. Run this as root on `<gateway_host>`,
   from the `adapters/sandbox-imp` folder of a nixie checkout at the release you run:

   ```bash
   IMPD_TOKEN='<impd_root_token>' ROUTE_KEY="$(cat <route_key_file>)" bun -e '
   import { createImpClient } from "@impz/client";
   const client = createImpClient({ url: "<impd_url>", token: process.env.IMPD_TOKEN });
   await client.secrets.add({
     name: "<secret_name>",
     kind: "custom",
     value: process.env.ROUTE_KEY.trim(),
     rules: [{ host: "chatgpt.com", header: "authorization", scheme: "bearer", upstream: "<model_url>" }],
   });'
   ```

   Expect: the command exits 0 and prints nothing.

   impd's credential broker, the part of impd that adds a secret to a sandbox's requests, then takes
   each plan request that a sandbox sends to `chatgpt.com`. It adds the route key, and sends the
   request to the gateway in place of ChatGPT.

6. Add the plan profile under `models.profiles` in nixie's `config.yaml`:

   ```yaml
   models:
     profiles:
       <route>:
         harness: codex
         base_url: https://chatgpt.com
         credential: deployment:<route>
         chatgpt_login: true
         model: <model>
         effort: low
         prices:
           input: <input>
           cache_write: <cache_write>
           cache_write_1h: <cache_write_1h>
           cached_input: <cached_input>
           output: <output>
   ```

   Set `effort` to the reasoning effort the tasks need
   ([model profiles](../architecture/core/model-profiles.md#harnesses)). Add nothing to nixie's
   secrets file for `deployment:<route>`. With `spendStop` set, the nixie server refuses to start
   when the secrets file has a `model_credentials` entry, and impd holds the route key
   ([credentials with a spending gateway](../architecture/core/model-profiles.md#credentials-with-a-spending-gateway)).

7. Restart the gateway and the nixie server, so each reads its new config.

   Expect: [the route's status](#read-the-routes-status) is `needs_login`, and the gateway answers
   each plan request with a 401 until you sign the route in.

## Sign the route in

1. The account holder turns on device code login in the ChatGPT account's security settings. Without
   it, the login command stops with a message that the setting is off.

2. On `<gateway_host>`, run as `<gateway_user>`:

   ```bash
   model-gateway chatgpt-login --config <config_file> --route <route>
   ```

   Expect: a line such as
   `Open https://auth.openai.com/codex/device and enter the code ABCD-1234 (expires in 15 minutes).`
   The command opens no browser and prints no token.

3. Send the URL and the code to the account holder, who opens the URL and approves the code in
   ChatGPT before it expires.

   Expect: the command prints `Signed in: <email>, plan <plan>. Stored for <route>.`, with the
   account's email and plan. When the code expires first, run the command again.

4. [Read the route's status](#read-the-routes-status). Expect: `"status": "active"` for `<route>`.

A running gateway reads the new login at the next plan request, so it needs no restart.

## When a Codex task fails with `model_auth.chatgpt_login`

[Read the route's status](#read-the-routes-status), then act on it:

| Status        | What it means                                                                     | What you do                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `needs_login` | OpenAI refused the login's refresh, or the route has no login file                | Do every step of [Sign the route in](#sign-the-route-in). The new login replaces the login file, and the gateway refreshes it again. |
| `failing`     | 3 refreshes in a row got an error answer or no answer                             | Check that `<gateway_host>` reaches `auth.openai.com`. The gateway keeps retrying, and the status returns to `active` on its own.    |
| `active`      | the gateway holds the login, but nixie's last read of the control listener failed | Check that the nixie server reaches the address in `spendStop.control`. nixie reads the status again with the gateway's `/status`.   |

## Remove the login

Remove the login when the plan route should stop spending the plan, such as when the account changes
hands.

1. On `<gateway_host>`, run as `<gateway_user>`:

   ```bash
   model-gateway chatgpt-logout --config <config_file> --route <route>
   ```

   Expect: `Removed the login for <route>.`, and [the route's status](#read-the-routes-status) turns
   to `needs_login`. The gateway answers each plan request with a 401 from then on, with no restart.

2. The account holder signs out the Codex sign-in in the ChatGPT account's security settings. OpenAI
   offers no way for the command to revoke the sign-in.
