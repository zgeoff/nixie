// The test runner's half of NIXIE_TEST_BUILD: the release bundle defines it as false at build time,
// and every test runs as a test build.
Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
