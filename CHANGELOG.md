# Changelog

## [0.2.0](https://github.com/zgeoff/nixie/compare/v0.1.0...v0.2.0) (2026-10-11)


### Features

* **geo-332:** add the kubernetes manifests and the k3s live checks ([#73](https://github.com/zgeoff/nixie/issues/73)) ([eec39c4](https://github.com/zgeoff/nixie/commit/eec39c4e623b8fb11160b95c1e1cc6f0d8a59410))


### Bug Fixes

* **geo-500:** match an image impd built by the digest its ref pins ([#75](https://github.com/zgeoff/nixie/issues/75)) ([4b7fbf3](https://github.com/zgeoff/nixie/commit/4b7fbf380c4447a332ab57819307a5e641757b65))

## 0.1.0 (2026-10-11)


### Features

* **contract:** add the slice 1 orpc contract and paste-span logic ([#44](https://github.com/zgeoff/nixie/issues/44)) ([c26b25b](https://github.com/zgeoff/nixie/commit/c26b25b8861d7b67f9521c35970a362d58022dfd))
* **db:** add the sqlite dialect, migrations and the single writer ([#43](https://github.com/zgeoff/nixie/issues/43)) ([5174e55](https://github.com/zgeoff/nixie/commit/5174e55335472ac6523fa0940bd6984a5de87afc))
* **definitions:** add the path source, persona seed and snapshot hash ([#48](https://github.com/zgeoff/nixie/issues/48)) ([0fc981b](https://github.com/zgeoff/nixie/commit/0fc981b3c4ebffd1d17cb33330594eda56ec0332))
* **definitions:** read only the known definitions paths ([#53](https://github.com/zgeoff/nixie/issues/53)) ([04616d8](https://github.com/zgeoff/nixie/commit/04616d83ae8a6ab2e25d36b73fe4b3e377d107d2))
* **geo-325:** serve the contract with device sessions and a live stream ([#64](https://github.com/zgeoff/nixie/issues/64)) ([76e7472](https://github.com/zgeoff/nixie/commit/76e7472a6697bf04fe60045e398e0edcc3cde903))
* **geo-327:** fetch one public page through the web fetch sandbox ([#65](https://github.com/zgeoff/nixie/issues/65)) ([c2ece9a](https://github.com/zgeoff/nixie/commit/c2ece9ab4c00a7486e13f74b4286e7fd055431f3))
* **geo-328:** run conversation turns through the agent sdk in a guest ([#66](https://github.com/zgeoff/nixie/issues/66)) ([089a4eb](https://github.com/zgeoff/nixie/commit/089a4ebbfcca1d5ee6b8c9557c0246e5698aca95))
* **geo-329:** add the crash harness and the slice 1 crash tests ([#69](https://github.com/zgeoff/nixie/issues/69)) ([c6233ca](https://github.com/zgeoff/nixie/commit/c6233cabc92f41f83a02beac70fe8fbcd67226c3))
* **geo-330:** wire the server, health and the nixie image ([#70](https://github.com/zgeoff/nixie/issues/70)) ([605a825](https://github.com/zgeoff/nixie/commit/605a8257b18fcfc2bd559dfbde8f85fef9bac1dc))
* **geo-331:** add the release pipeline ([#71](https://github.com/zgeoff/nixie/issues/71)) ([5329274](https://github.com/zgeoff/nixie/commit/5329274cbf7cc9280accd68a3dd7fcdfdad0595e))
* **log:** add the record envelope, record keys and projections ([#45](https://github.com/zgeoff/nixie/issues/45)) ([7e2310a](https://github.com/zgeoff/nixie/commit/7e2310a15f6b9b43e490280236e42fe6594e7353))
* **sandbox:** add the sandbox interface, imp adapter and process double ([#50](https://github.com/zgeoff/nixie/issues/50)) ([f991f43](https://github.com/zgeoff/nixie/commit/f991f43e7758ff0cf3608a89e3a0e03feff2afdd))
* **spikes:** add the event log spike on sqlite and postgres ([#13](https://github.com/zgeoff/nixie/issues/13)) ([a0aa9f2](https://github.com/zgeoff/nixie/commit/a0aa9f2da7d42d36e7af48acc35862216abdc8f6))
* **spikes:** add the model-eval spike for chat, memory, and tools ([#7](https://github.com/zgeoff/nixie/issues/7)) ([c937457](https://github.com/zgeoff/nixie/commit/c9374578baac11b022f50398409bb82862608491))
* **spikes:** forward the device session through a separate start server ([#26](https://github.com/zgeoff/nixie/issues/26)) ([1483736](https://github.com/zgeoff/nixie/commit/148373673ab07e4be7693ea1ac5ef0d27aeec82a))
* **spikes:** measure agent sdk time to first token ([#12](https://github.com/zgeoff/nixie/issues/12)) ([79b7cd1](https://github.com/zgeoff/nixie/commit/79b7cd17c226e91a6ee266dcb9eae3ad809d9ae8))
* **spikes:** run the pinned core and message input cases ([#28](https://github.com/zgeoff/nixie/issues/28)) ([ef9f53c](https://github.com/zgeoff/nixie/commit/ef9f53c238a1ab07078597605a2465bf217bab7e))
* **spikes:** test a personal google oauth client ([#11](https://github.com/zgeoff/nixie/issues/11)) ([aec4966](https://github.com/zgeoff/nixie/commit/aec4966060f08a142f896452db6eec81b0398e89))
* **spikes:** time a worker that runs inside its own imp ([#16](https://github.com/zgeoff/nixie/issues/16)) ([62dc1ee](https://github.com/zgeoff/nixie/commit/62dc1ee4d79f97f4d1f930f285c67fa25183ad4f))
* **tasks:** run tasks and actions on one lease claim path ([#52](https://github.com/zgeoff/nixie/issues/52)) ([f88e996](https://github.com/zgeoff/nixie/commit/f88e996e74bce53d12ddd58084b91a10f5f8c934))
* **tools:** add the per-run tool endpoint and the decision point ([#51](https://github.com/zgeoff/nixie/issues/51)) ([e6f82ef](https://github.com/zgeoff/nixie/commit/e6f82ef362af02a39687ca192b1595f10aa4501c))
* **web:** add the start web client with session forwarding ([#46](https://github.com/zgeoff/nixie/issues/46)) ([6f37d8e](https://github.com/zgeoff/nixie/commit/6f37d8e5d12e6ebb530a44cb54c0034485c14122))


### Bug Fixes

* **geo-327:** give the fetch sandbox a disk that imp can start ([#67](https://github.com/zgeoff/nixie/issues/67)) ([cb5e769](https://github.com/zgeoff/nixie/commit/cb5e7699ea11b164feee6bd0d75616672aa0288d))
* **geo-327:** probe impd by address and the tailnet on port 80 ([#68](https://github.com/zgeoff/nixie/issues/68)) ([b04c778](https://github.com/zgeoff/nixie/commit/b04c778ef68ce0efd7e97e20e890dcc4fac66c54))
* **model-eval:** give non-anthropic runs an empty home ([#62](https://github.com/zgeoff/nixie/issues/62)) ([c1002a8](https://github.com/zgeoff/nixie/commit/c1002a86cb10bd1e573609b82eefc83a82f7e15d))
* **sandbox-imp:** give each isolation probe test time for its probes ([#61](https://github.com/zgeoff/nixie/issues/61)) ([f83a11b](https://github.com/zgeoff/nixie/commit/f83a11bc2af866b42824248ed25a6ed37d940a03))
* **sandbox-imp:** make the isolation tests run and clean up on imp ([#54](https://github.com/zgeoff/nixie/issues/54)) ([dec682b](https://github.com/zgeoff/nixie/commit/dec682ba35d6367c16cd24156eedbfc88e4441ec))
