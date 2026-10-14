# Changelog

## [0.21.0](https://github.com/zgeoff/nixie/compare/v0.20.0...v0.21.0) (2026-10-14)


### Features

* **geo-870:** lead each message stamp with its event id ([#214](https://github.com/zgeoff/nixie/issues/214)) ([02215cb](https://github.com/zgeoff/nixie/commit/02215cbc9384d0287e5b43661f6c4779f0536dd8))
* **geo-871:** render every nixie block as a system-message element ([#222](https://github.com/zgeoff/nixie/issues/222)) ([ea53270](https://github.com/zgeoff/nixie/commit/ea53270718ca171b78cad1d0ac1f51d3ac29ed0c))
* **geo-872:** open every session from one builder ([#225](https://github.com/zgeoff/nixie/issues/225)) ([1fd7956](https://github.com/zgeoff/nixie/commit/1fd79563778519772cc3e55874139837c25c740c))


### Bug Fixes

* **geo-492:** refuse a queued call from a step that lost its claim ([#223](https://github.com/zgeoff/nixie/issues/223)) ([366730f](https://github.com/zgeoff/nixie/commit/366730f9476b45dd31873f5fcc6ba468da1b1b70))
* **geo-501:** retry a refused definitions seed within seconds ([#221](https://github.com/zgeoff/nixie/issues/221)) ([881a5db](https://github.com/zgeoff/nixie/commit/881a5db8ba6c6b61b4a2f240b733b7508a260837))
* **geo-515:** close a page's partial step and unnest a linked image ([#220](https://github.com/zgeoff/nixie/issues/220)) ([7981782](https://github.com/zgeoff/nixie/commit/7981782ab6d5d1cdb9f035c1c1483381be46cc6e))
* **geo-566:** check the writer lease at the time the publish runs ([#224](https://github.com/zgeoff/nixie/issues/224)) ([9319a43](https://github.com/zgeoff/nixie/commit/9319a4342abc19873e1027b68ed8e79039cbf7d5))

## [0.20.0](https://github.com/zgeoff/nixie/compare/v0.19.0...v0.20.0) (2026-10-14)


### Features

* **geo-784:** say what changed for the conversation on a restart ([#208](https://github.com/zgeoff/nixie/issues/208)) ([4bd3775](https://github.com/zgeoff/nixie/commit/4bd3775754716ac74160459056cd09c856cdecf3))
* **geo-802:** let the model rate the memories it was given ([#212](https://github.com/zgeoff/nixie/issues/212)) ([428b1bb](https://github.com/zgeoff/nixie/commit/428b1bbd03a3cd6359396d06c91461bd69ef2183))
* **geo-850:** seal the consolidation summary and show it in the diff ([#209](https://github.com/zgeoff/nixie/issues/209)) ([799b7a7](https://github.com/zgeoff/nixie/commit/799b7a7763bd13ea2d9a4663fa5de33394c3d343))
* **geo-856:** add the reset command that keeps the device sessions ([#213](https://github.com/zgeoff/nixie/issues/213)) ([78e67a5](https://github.com/zgeoff/nixie/commit/78e67a522628d2d0cb005d603defe05c4d66de0a))

## [0.19.0](https://github.com/zgeoff/nixie/compare/v0.18.0...v0.19.0) (2026-10-14)


### Features

* **geo-776:** show where each memory came from in plain words ([#197](https://github.com/zgeoff/nixie/issues/197)) ([7226762](https://github.com/zgeoff/nixie/commit/7226762f6828be069dfd1e9d0148a00f05ef7760))
* **geo-852:** stamp timer and outcome inputs, drop reply-times ([#205](https://github.com/zgeoff/nixie/issues/205)) ([cbd70f8](https://github.com/zgeoff/nixie/commit/cbd70f8c825dc526a2aad61197fbd741cde22122))


### Bug Fixes

* **geo-854:** wake the imp before a turn so its tool route listens again ([#204](https://github.com/zgeoff/nixie/issues/204)) ([7596eb2](https://github.com/zgeoff/nixie/commit/7596eb2cc29a2f8e91fef3f19827ad5c6fc023ff))

## [0.18.0](https://github.com/zgeoff/nixie/compare/v0.17.0...v0.18.0) (2026-10-14)


### Features

* **geo-838:** keep each item's own words in the consolidation pass ([#200](https://github.com/zgeoff/nixie/issues/200)) ([c44aa9e](https://github.com/zgeoff/nixie/commit/c44aa9e2b660c18807a5719ae1ffd6c5b1e82ba9))
* **geo-851:** resolve deployment references in the owner's pronouns ([#202](https://github.com/zgeoff/nixie/issues/202)) ([ccc8afd](https://github.com/zgeoff/nixie/commit/ccc8afdca4170ecc83cf43b1b3629bd62ef70b7c))

## [0.17.0](https://github.com/zgeoff/nixie/compare/v0.16.0...v0.17.0) (2026-10-14)


### Features

* **geo-747:** let the conversation read its own event log ([#199](https://github.com/zgeoff/nixie/issues/199)) ([5eb7143](https://github.com/zgeoff/nixie/commit/5eb7143dac9d745e9671687d8275a3ea6bf52ba0))
* **geo-793:** tell the model why a memory write became a proposal ([#196](https://github.com/zgeoff/nixie/issues/196)) ([9c8cca2](https://github.com/zgeoff/nixie/commit/9c8cca2dd39e8a27c9c9b23d81f2b2248d82fd76))
* **geo-833:** let the conversation read and comment on the memory diff ([#195](https://github.com/zgeoff/nixie/issues/195)) ([28c9203](https://github.com/zgeoff/nixie/commit/28c9203170b9ce3043e591c217a4b717c0851528))

## [0.16.0](https://github.com/zgeoff/nixie/compare/v0.15.0...v0.16.0) (2026-10-14)


### Features

* **geo-763:** name the owner in the memory writer and checker prompts ([#192](https://github.com/zgeoff/nixie/issues/192)) ([57ceb07](https://github.com/zgeoff/nixie/commit/57ceb07f6640737a1e301d0945d4bc544a554a78))
* **geo-834:** tell a resumed session when its last replies were sent ([#194](https://github.com/zgeoff/nixie/issues/194)) ([0ebf2ed](https://github.com/zgeoff/nixie/commit/0ebf2ed9bb262973defc193b08a5be7baba32bf5))


### Bug Fixes

* **geo-766:** count a keyboard's split of a run-together word as typed ([#190](https://github.com/zgeoff/nixie/issues/190)) ([4b0cfb7](https://github.com/zgeoff/nixie/commit/4b0cfb7b9e712ea08a9558e1d2a685ac1266b92b))
* **geo-835:** name the image impd refuses and test start on held images ([#193](https://github.com/zgeoff/nixie/issues/193)) ([4696bcb](https://github.com/zgeoff/nixie/commit/4696bcba9eeeee9668b2437d10e164f25cae8d4b))

## [0.15.0](https://github.com/zgeoff/nixie/compare/v0.14.1...v0.15.0) (2026-10-14)


### Features

* **geo-777:** give memory items short ids the model reads ([#186](https://github.com/zgeoff/nixie/issues/186)) ([beda44c](https://github.com/zgeoff/nixie/commit/beda44c167343ab3f90307f784ae9fbe7d0a554e))
* **geo-791:** propose a weekly memory consolidation diff for review ([#184](https://github.com/zgeoff/nixie/issues/184)) ([0bd5f41](https://github.com/zgeoff/nixie/commit/0bd5f41aeb7b25f3a350acc6e8a3e69b0a9deff3))


### Bug Fixes

* **geo-823:** reconnect once to the tool server before a turn starts ([#189](https://github.com/zgeoff/nixie/issues/189)) ([aa192ae](https://github.com/zgeoff/nixie/commit/aa192aedb3c438aa3c13a46bd810213f8ae4fd78))

## [0.14.1](https://github.com/zgeoff/nixie/compare/v0.14.0...v0.14.1) (2026-10-13)


### Bug Fixes

* **geo-824:** stamp each history reply in the local time of its message ([#183](https://github.com/zgeoff/nixie/issues/183)) ([ec833f3](https://github.com/zgeoff/nixie/commit/ec833f3cf51090b2deda1b7217310f1427ec5efa))

## [0.14.0](https://github.com/zgeoff/nixie/compare/v0.13.0...v0.14.0) (2026-10-13)


### Features

* **geo-779:** show how full the context is and mark each compaction ([#176](https://github.com/zgeoff/nixie/issues/176)) ([29aa1cc](https://github.com/zgeoff/nixie/commit/29aa1cc584c23c3d9ba12f09ee0eae452dde41f1))
* **geo-790:** edit, retire, restore and pin a memory item from the host ([#179](https://github.com/zgeoff/nixie/issues/179)) ([a816a3b](https://github.com/zgeoff/nixie/commit/a816a3bea330d68fc14dbd19ac4c6f159a23af8a))
* **geo-799:** show what each turn was given ([#172](https://github.com/zgeoff/nixie/issues/172)) ([654572a](https://github.com/zgeoff/nixie/commit/654572a748dd98960d77fd01ad0eecdeb7058d2f))
* **geo-817:** read the owner's name from the secrets file by reference ([#181](https://github.com/zgeoff/nixie/issues/181)) ([593a4fc](https://github.com/zgeoff/nixie/commit/593a4fcbe324146bc8f25a1682e8ca581bae95ac))


### Bug Fixes

* **geo-810:** keep the recalls after a compaction as delivered ([#178](https://github.com/zgeoff/nixie/issues/178)) ([6273869](https://github.com/zgeoff/nixie/commit/62738693bb5256ea120850538433f345d5b0fe5a))
* **geo-815:** report the forget scan as incomplete when it cannot read a file ([#175](https://github.com/zgeoff/nixie/issues/175)) ([8c53c42](https://github.com/zgeoff/nixie/commit/8c53c4218d81a9138334ec0bd05526b581a900da))
* **geo-818:** hide cached memory text until a fresh read succeeds ([#180](https://github.com/zgeoff/nixie/issues/180)) ([1205c08](https://github.com/zgeoff/nixie/commit/1205c0899f70d0bf86b18d9ff881e78a311515f6))

## [0.13.0](https://github.com/zgeoff/nixie/compare/v0.12.0...v0.13.0) (2026-10-13)


### Features

* **geo-479:** keep the conversation answering after failed turns ([#166](https://github.com/zgeoff/nixie/issues/166)) ([0333b38](https://github.com/zgeoff/nixie/commit/0333b380863208773f17d43daf12c5c3d99ceddc))
* **geo-755:** log the revision and content hash a seed put in force ([#170](https://github.com/zgeoff/nixie/issues/170)) ([5a73269](https://github.com/zgeoff/nixie/commit/5a732695cde8b087bcc4753a86d8244fd4f07828))
* **geo-774:** show why a task step failed in the web view and the log ([#157](https://github.com/zgeoff/nixie/issues/157)) ([8080160](https://github.com/zgeoff/nixie/commit/8080160080f7a604f0dcba9318662a5007635901))
* **geo-778:** add a dark theme that follows the system setting ([#153](https://github.com/zgeoff/nixie/issues/153)) ([b3e9fdf](https://github.com/zgeoff/nixie/commit/b3e9fdf264ed3abaf6a477140f9d4a7f66f7d42c))
* **geo-780:** add the time tool and a time zone on each message ([#155](https://github.com/zgeoff/nixie/issues/155)) ([9393135](https://github.com/zgeoff/nixie/commit/9393135feec02f5cbf26653f2ac574db806d80ef))
* **geo-781:** show the model when each of your messages was sent ([#162](https://github.com/zgeoff/nixie/issues/162)) ([14f71b2](https://github.com/zgeoff/nixie/commit/14f71b2ba024bd8e277736de9b49bdef310f786c))
* **geo-782:** tell the conversation what happened outside it ([#158](https://github.com/zgeoff/nixie/issues/158)) ([2f3cafd](https://github.com/zgeoff/nixie/commit/2f3cafdace7c1db0ab1ee282b0f960c78e674df3))
* **geo-787:** mark the text you pasted or dropped in your messages ([#169](https://github.com/zgeoff/nixie/issues/169)) ([6cdc045](https://github.com/zgeoff/nixie/commit/6cdc04556c6a5cb8ca4aa1439adf56d10be1deaf))
* **geo-788:** list the memory proposals that still wait for review ([#171](https://github.com/zgeoff/nixie/issues/171)) ([b941a5b](https://github.com/zgeoff/nixie/commit/b941a5b5355a237199f68e7e0faee6cbea5f2c16))
* **geo-789:** give memory edits their own tool, memory.edit ([#154](https://github.com/zgeoff/nixie/issues/154)) ([f2bb867](https://github.com/zgeoff/nixie/commit/f2bb867eef2e3d2f26bd6e81ae2ca4a206d74971))
* **geo-796:** show the device session each message came from ([#173](https://github.com/zgeoff/nixie/issues/173)) ([726f3d8](https://github.com/zgeoff/nixie/commit/726f3d84ba48749a4f5ff3d9279b4b17d97df231))
* **geo-798:** make the web client installable as an app ([#160](https://github.com/zgeoff/nixie/issues/160)) ([045163a](https://github.com/zgeoff/nixie/commit/045163a1afaa131130e1dd5d6c6943ecaf70bac3))
* **geo-800:** leave out memories the session already holds ([#161](https://github.com/zgeoff/nixie/issues/161)) ([6b58d02](https://github.com/zgeoff/nixie/commit/6b58d022fa3fd020041e9f624ad11cd0a68e481b))
* **geo-801:** leave the owner's and the agent's names out of retrieval ([#165](https://github.com/zgeoff/nixie/issues/165)) ([76109c0](https://github.com/zgeoff/nixie/commit/76109c0ff03c74287a2b30e174f41531dbdb2f9a))
* **geo-805:** split the memory writer's edit from remember ([#163](https://github.com/zgeoff/nixie/issues/163)) ([d7a22c9](https://github.com/zgeoff/nixie/commit/d7a22c9c60b57fa16b70cf85760daa6a522842de))


### Bug Fixes

* **geo-551:** price a cold first batch and score an ended class in the spike ([#164](https://github.com/zgeoff/nixie/issues/164)) ([c2ee32c](https://github.com/zgeoff/nixie/commit/c2ee32c276b9dd72f844150501576a233e4c657d))
* **geo-553:** read every file to its end in the forget scan ([#168](https://github.com/zgeoff/nixie/issues/168)) ([d7e23c5](https://github.com/zgeoff/nixie/commit/d7e23c557041574177a352a4d1a74bdb1110481a))

## [0.12.0](https://github.com/zgeoff/nixie/compare/v0.11.0...v0.12.0) (2026-10-13)


### Features

* **geo-745:** merge a repeated memory proposal into the pending one ([#149](https://github.com/zgeoff/nixie/issues/149)) ([56d754a](https://github.com/zgeoff/nixie/commit/56d754ab58d4bebae9ebf72a0e64986025cc6352))
* **geo-752:** show memory as the model's own, with how it came up ([#151](https://github.com/zgeoff/nixie/issues/151)) ([af20a9d](https://github.com/zgeoff/nixie/commit/af20a9df5e8b74a2e54dc10f61c014437eb7ef63))


### Bug Fixes

* **geo-765:** leave function words out of the memory retrieval query ([#150](https://github.com/zgeoff/nixie/issues/150)) ([52e8efb](https://github.com/zgeoff/nixie/commit/52e8efb8a0bdd2c87874b3653d81701eadd8b5ad))

## [0.11.0](https://github.com/zgeoff/nixie/compare/v0.10.0...v0.11.0) (2026-10-13)


### Features

* **geo-744:** log each definitions probe so a quiet log shows life ([#145](https://github.com/zgeoff/nixie/issues/145)) ([aba620a](https://github.com/zgeoff/nixie/commit/aba620a6637b45040b7345180da59f49cbe5db0b))

## [0.10.0](https://github.com/zgeoff/nixie/compare/v0.9.0...v0.10.0) (2026-10-13)


### Features

* **geo-746:** answer memory proposals through host commands ([#143](https://github.com/zgeoff/nixie/issues/143)) ([f7e4924](https://github.com/zgeoff/nixie/commit/f7e4924cba9f09312cfdce36caf192ea3bf31fc4))

## [0.9.0](https://github.com/zgeoff/nixie/compare/v0.8.0...v0.9.0) (2026-10-13)


### Features

* **geo-567:** mark the first turn of a new or rebuilt session ([#141](https://github.com/zgeoff/nixie/issues/141)) ([9adb5fb](https://github.com/zgeoff/nixie/commit/9adb5fb8ef2ad61f954f78f679abdefd7661f288))


### Bug Fixes

* **geo-751:** apply the retrieval score floor in a small memory index ([#142](https://github.com/zgeoff/nixie/issues/142)) ([33494b1](https://github.com/zgeoff/nixie/commit/33494b197abfa71dfee0db1d3a10cb7e24e17b26))
* **geo-756:** recheck a proposed write's item before the batch publishes ([#144](https://github.com/zgeoff/nixie/issues/144)) ([9ca5223](https://github.com/zgeoff/nixie/commit/9ca5223ffc0e0a28bef51a62f444eaf5f5e7b179))

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
