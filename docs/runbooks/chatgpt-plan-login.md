# Run Codex tasks on a ChatGPT plan login

A model gateway can hold a ChatGPT plan login, so a task on the Codex harness runs on the plan in
place of an API key. The operator sets up the plan route once, signs the route in, and signs it in
again when its login needs it. The design is in
[the plan route](../architecture/policy/model-gateway.md#the-plan-route). Before you start, the
deployment needs a `spendStop` section and a model gateway with a periods config.

Placeholders in this runbook:

- `<gateway_host>`: the host that runs the model gateway.
- `<config file>`: the gateway's config file.
- `<route>`: the plan route's ID, which is also the plan profile's ID.
- `<route key file>`: the file that holds the route key.

## Set up the plan route

1. Make the route key on `<gateway_host>`, 32 random bytes in hex, and keep it out of any log:

   ```bash
   openssl rand -hex 32 > <route key file>
   chmod 600 <route key file>
   ```

2. Add the route to `<config file>`, with a `login` block. The login file's folder must be one that
   only the gateway's user reads:

   ```yaml
   routes:
     <route>:
       api: openai-responses
       upstream: https://chatgpt.com/backend-api/codex
       model: <model>
       maxOutputTokens: <max_output_tokens>
       prices: { … }
       login:
         file: <login file>
         routeKeyFile: <route key file>
   ```

   Set the route's `prices` to the API prices of `<model>`. A plan has no price per token, but Codex
   usage past the plan's limit can draw on bought credits, so the dollar limit bounds that spend.

3. Add the route key as the plan profile's impd secret, with impd's root access, as for every model
   secret: host `chatgpt.com`, header `authorization`, scheme `bearer`, and the gateway's model
   listener as its upstream. The secret's name is the profile's `credential`.

4. Add the plan profile to the deployment config, with the same prices as the route:

   ```yaml
   models:
     profiles:
       <route>:
         harness: codex
         base_url: https://chatgpt.com
         credential: deployment:<secret_name>
         chatgpt_login: true
         model: <model>
         effort: low
         prices: { … }
   ```

5. Restart the gateway. Until the next step, the route reports `needs_login` and answers each
   request with a 401.

## Sign the route in

1. Device code login must be on in the account's ChatGPT security settings. The account's user turns
   it on.

2. Run the command on `<gateway_host>`:

   ```bash
   model-gateway chatgpt-login --config <config file> --route <route>
   ```

   Expect a line such as
   `Open https://auth.openai.com/codex/device and enter the code ABCD-1234 (expires in 15 minutes).`
   The command opens no browser and prints no token.

3. The account's user opens the URL and approves the code in ChatGPT. Expect the command to print
   `Signed in: <email>, plan <plan>. Stored for <route>.` A command that prints that the code
   expired needs a new run.

4. Read the route's state from the control listener:

   ```bash
   curl -s -H "Authorization: Bearer <control token>" http://<control_address>/chatgpt-logins
   ```

   Expect `"status": "active"` for `<route>`. The answer holds no token and no email.

A running gateway picks up a new login at its next request, so a restart is not needed.

## Sign the route in again

A route whose status is `needs_login` answers each request with a 401, and a Codex task on its
profile fails with `model_auth.chatgpt_login` until the route has a login. A status of `failing`
means the gateway could not refresh the login 3 times in a row, and it keeps retrying. When the
status stays `failing`, check that `<gateway_host>` reaches `auth.openai.com`. Run
`model-gateway chatgpt-login` again as in the steps above. A new login replaces the file and
restarts the refresh.

## Remove the login

```bash
model-gateway chatgpt-logout --config <config file> --route <route>
```

The command removes the login file. OpenAI documents no revocation for this sign-in, so the
account's user also signs the device out in ChatGPT's security settings.
