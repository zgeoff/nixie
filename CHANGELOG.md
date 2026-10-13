# Changelog

## [0.8.0](https://github.com/zgeoff/nixie/compare/v0.7.0...v0.8.0) (2026-10-13)


### Features

* **geo-741:** gate writer batches so the memory writer runs ([#138](https://github.com/zgeoff/nixie/issues/138)) ([39ef5a8](https://github.com/zgeoff/nixie/commit/39ef5a874b9fd0e16a0efb8a67ac15b6887e7885))


### Bug Fixes

* **geo-754:** raise the checker timeout to 20 s and log its timings ([#140](https://github.com/zgeoff/nixie/issues/140)) ([fa026c3](https://github.com/zgeoff/nixie/commit/fa026c39d85d0d4c2d17e20408f74c76e77081f5))

## [0.7.0](https://github.com/zgeoff/nixie/compare/v0.6.2...v0.7.0) (2026-10-13)


### Features

* **geo-531:** let the batch harness read turns from a file ([#136](https://github.com/zgeoff/nixie/issues/136)) ([09d509a](https://github.com/zgeoff/nixie/commit/09d509a1706396a72155aff85be67c00a25c1592))
* **geo-535:** keep every nixie sandbox out of impd's backups ([#132](https://github.com/zgeoff/nixie/issues/132)) ([d4a4a05](https://github.com/zgeoff/nixie/commit/d4a4a05d7d6dcfa74369f1a7de43586a8e09b286))
* **geo-737:** give the conversation the memory tools ([#134](https://github.com/zgeoff/nixie/issues/134)) ([2aaee75](https://github.com/zgeoff/nixie/commit/2aaee750b81380bf1eab747b7c77dff274a09320))


### Bug Fixes

* **geo-735:** move to imp-client 1.0.0 to speak impd 1.0 ([#135](https://github.com/zgeoff/nixie/issues/135)) ([ea8ca7d](https://github.com/zgeoff/nixie/commit/ea8ca7d64a1fe6907a7e35aa9ad73dd6534ac059))

## [0.6.2](https://github.com/zgeoff/nixie/compare/v0.6.1...v0.6.2) (2026-10-12)


### Bug Fixes

* **geo-733:** move to imp-client 0.42.0 to speak impd 0.42 ([#130](https://github.com/zgeoff/nixie/issues/130)) ([4a74538](https://github.com/zgeoff/nixie/commit/4a74538a1e8d301e09677f7f7c17023246b54130))

## [0.6.1](https://github.com/zgeoff/nixie/compare/v0.6.0...v0.6.1) (2026-10-12)


### Bug Fixes

* **geo-731:** give the writer and checker sandboxes a 4096 mib disk ([#128](https://github.com/zgeoff/nixie/issues/128)) ([2198690](https://github.com/zgeoff/nixie/commit/219869090e9cdc3d0472847334bb43f33fdaa870))

## [0.6.0](https://github.com/zgeoff/nixie/compare/v0.5.0...v0.6.0) (2026-10-12)


### Features

* **geo-529:** add the memory store and its operations ([#120](https://github.com/zgeoff/nixie/issues/120)) ([d79ce1a](https://github.com/zgeoff/nixie/commit/d79ce1a854549d36c3809c85a6416cbb2ad1ee55))
* **geo-530:** gate memory writes behind the user's typed words ([#124](https://github.com/zgeoff/nixie/issues/124)) ([b034132](https://github.com/zgeoff/nixie/commit/b034132c1441b007c7843d6cb1c35eee99d17c1a))
* **geo-531:** add the batched memory writer and its catch-up ([#125](https://github.com/zgeoff/nixie/issues/125)) ([4d4773c](https://github.com/zgeoff/nixie/commit/4d4773c75b592cda0afd534d76f0e98554e2a0de))
* **geo-532:** put memory in each turn and rebuild lost sessions ([#122](https://github.com/zgeoff/nixie/issues/122)) ([5bad1e7](https://github.com/zgeoff/nixie/commit/5bad1e7057dd463a380bc10abf2db43ab9e58dda))
* **geo-576:** carry the conversation session into a replaced sandbox ([#126](https://github.com/zgeoff/nixie/issues/126)) ([47ce7c9](https://github.com/zgeoff/nixie/commit/47ce7c9ebaab97aa883d06dd299e57c8c9a74394))


### Bug Fixes

* **geo-530:** finish a key store checkpoint a reader blocked ([#127](https://github.com/zgeoff/nixie/issues/127)) ([74d6f25](https://github.com/zgeoff/nixie/commit/74d6f254ebf51f6d5aaf090dec9f330e6bd09c2e))

## [0.5.0](https://github.com/zgeoff/nixie/compare/v0.4.0...v0.5.0) (2026-10-12)


### Features

* **geo-550:** cap the conversation context per model profile ([#114](https://github.com/zgeoff/nixie/issues/114)) ([2c5ece3](https://github.com/zgeoff/nixie/commit/2c5ece3334e874c1aed8f5f1990fab95307470ca))


### Bug Fixes

* **geo-549:** reconnect at once when the page wakes during a backoff ([#115](https://github.com/zgeoff/nixie/issues/115)) ([e65ec77](https://github.com/zgeoff/nixie/commit/e65ec770b4bef63190c5611066f5a374c2d462b8))

## [0.4.0](https://github.com/zgeoff/nixie/compare/v0.3.0...v0.4.0) (2026-10-12)


### Features

* **geo-524:** add a spinner, follow-scroll and a top output toggle ([#110](https://github.com/zgeoff/nixie/issues/110)) ([5f39b29](https://github.com/zgeoff/nixie/commit/5f39b295395cf45fc9dcd464c63bc31328031f37))
* **geo-525:** read a page's main content and report a bot challenge ([#111](https://github.com/zgeoff/nixie/issues/111)) ([be2df08](https://github.com/zgeoff/nixie/commit/be2df08c2722073d8cd44c3cc375e0c90d11b9ed))


### Bug Fixes

* **geo-523:** keep live updates working behind content blockers ([#109](https://github.com/zgeoff/nixie/issues/109)) ([fb10593](https://github.com/zgeoff/nixie/commit/fb10593f86d5a4483ee8dac3ba4473599583d63e))
* **geo-538:** keep each sticky toggle inside its own value ([#113](https://github.com/zgeoff/nixie/issues/113)) ([96730a5](https://github.com/zgeoff/nixie/commit/96730a58ccc4596e567a60647b9c27254f513414))

## [0.3.0](https://github.com/zgeoff/nixie/compare/v0.2.0...v0.3.0) (2026-10-12)


### Features

* **geo-503:** reconnect a live stream that dies without closing ([#84](https://github.com/zgeoff/nixie/issues/84)) ([cbf8a59](https://github.com/zgeoff/nixie/commit/cbf8a597078ed2f1fc770785d029c25f9d4eabc3))
* **geo-504:** move the web client to panda css and the react compiler ([#80](https://github.com/zgeoff/nixie/issues/80)) ([75b8aa3](https://github.com/zgeoff/nixie/commit/75b8aa33d503f5f1d30b69ab247a4ab53414203c))
* **geo-505:** fold each step into one line that names its tools ([#86](https://github.com/zgeoff/nixie/issues/86)) ([86b197f](https://github.com/zgeoff/nixie/commit/86b197fe976980bcf1a831cf8ceddeb1bca20388))
* **geo-506:** render replies as markdown with inert html and safe links ([#90](https://github.com/zgeoff/nixie/issues/90)) ([cb44c55](https://github.com/zgeoff/nixie/commit/cb44c55520e7d35cbb6e30920bd7635bca697f45))


### Bug Fixes

* **geo-493:** retry the wal switch when connections open a new file ([#85](https://github.com/zgeoff/nixie/issues/85)) ([598cbfe](https://github.com/zgeoff/nixie/commit/598cbfe86442c63ff136d574bbc087b05e343d7e))

## [0.2.0](https://github.com/zgeoff/nixie/compare/v0.1.0...v0.2.0) (2026-10-11)


### Features

* **geo-332:** add the kubernetes manifests and the live checks ([#73](https://github.com/zgeoff/nixie/issues/73)) ([eec39c4](https://github.com/zgeoff/nixie/commit/eec39c4e623b8fb11160b95c1e1cc6f0d8a59410))


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
* **geo-327:** probe impd by address and a private address on port 80 ([#68](https://github.com/zgeoff/nixie/issues/68)) ([b04c778](https://github.com/zgeoff/nixie/commit/b04c778ef68ce0efd7e97e20e890dcc4fac66c54))
* **model-eval:** give non-anthropic runs an empty home ([#62](https://github.com/zgeoff/nixie/issues/62)) ([c1002a8](https://github.com/zgeoff/nixie/commit/c1002a86cb10bd1e573609b82eefc83a82f7e15d))
* **sandbox-imp:** give each isolation probe test time for its probes ([#61](https://github.com/zgeoff/nixie/issues/61)) ([f83a11b](https://github.com/zgeoff/nixie/commit/f83a11bc2af866b42824248ed25a6ed37d940a03))
* **sandbox-imp:** make the isolation tests run and clean up on imp ([#54](https://github.com/zgeoff/nixie/issues/54)) ([dec682b](https://github.com/zgeoff/nixie/commit/dec682ba35d6367c16cd24156eedbfc88e4441ec))
