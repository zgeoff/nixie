# Run the imp isolation tests

The isolation tests in `adapters/sandbox-imp/src/isolation.test.ts` check what a conversation imp
reaches through the imp adapter. Through the reverse forward it reaches the tool endpoint. Through
the broker it reaches only the model host. Every direct connection fails: the internet, impd, the
gateway, the metadata service and the tailnet's resolver. With the host addresses set, a further
test checks that a public imp reaches the internet and never the host or impd. The tests skip unless
the variables below are set, and they need a host with `/dev/kvm` and impd.

1. Start an impd that you can create imps and secrets on, and get a token with manage scope for it.
2. Import an image that holds `sh`, `curl` and `ip`, such as `ubuntu:24.04` with `curl` installed.
3. Run the tests from the repo root:

   ```bash
   NIXIE_IMP_TEST_URL=<impd_url> \
   NIXIE_IMP_TEST_TOKEN=<impd_token> \
   NIXIE_IMP_TEST_IMAGE=<image_name> \
   NIXIE_IMP_TEST_HOST_ADDRESSES=<host_addresses> \
   bun test adapters/sandbox-imp/src/isolation.test.ts
   ```

   Leave out `NIXIE_IMP_TEST_HOST_ADDRESSES` to skip the public egress test. It takes the same list
   that impd reads from `IMP_HOST_ADDRESSES`.

Expect `0 fail`, with no skipped test. The tests create one imp per egress kind and a secret named
`nixie-test-<id>` with a dummy value, and remove all of them when they end.
