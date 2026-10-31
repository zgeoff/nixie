# Changelog

## [0.58.1](https://github.com/zgeoff/nixie/compare/v0.58.0...v0.58.1) (2026-10-31)


### Bug Fixes

* **deps:** update @modelcontextprotocol/client to v2.4.0 ([#751](https://github.com/zgeoff/nixie/issues/751)) ([ff2ad4e](https://github.com/zgeoff/nixie/commit/ff2ad4e1414076bb47e35db873b023c9599fd17b))
* **deps:** update @modelcontextprotocol/server to v2.4.0 ([#752](https://github.com/zgeoff/nixie/issues/752)) ([85e83fa](https://github.com/zgeoff/nixie/commit/85e83fac28258d8e9f937141987f2597ed4bd81b))
* **hooks:** exclude top-level paths from format-codemod too ([#762](https://github.com/zgeoff/nixie/issues/762)) ([fe2892c](https://github.com/zgeoff/nixie/commit/fe2892c0baff8c677bdbbf855477d19a84d66c74))

## [0.58.0](https://github.com/zgeoff/nixie/compare/v0.57.1...v0.58.0) (2026-10-30)


### Features

* **api:** give the task list its waits, controls and action counts ([#735](https://github.com/zgeoff/nixie/issues/735)) ([40d0fcc](https://github.com/zgeoff/nixie/commit/40d0fccd01dcbfb29fab6a6cb59a8069a14435a7))
* **web:** add the task dashboard and the task page controls ([#736](https://github.com/zgeoff/nixie/issues/736)) ([a9e0bbf](https://github.com/zgeoff/nixie/commit/a9e0bbfc0dc2b0887a42b85da67f3a543a8c9639))


### Bug Fixes

* **deps:** update tanstack-router monorepo ([#729](https://github.com/zgeoff/nixie/issues/729)) ([b356c51](https://github.com/zgeoff/nixie/commit/b356c51fc34739987725f4617a4280803bd3099c))

## [0.57.1](https://github.com/zgeoff/nixie/compare/v0.57.0...v0.57.1) (2026-10-29)


### Bug Fixes

* **api:** show a stop's cancelled action as cancelled in the thread ([#727](https://github.com/zgeoff/nixie/issues/727)) ([b45784a](https://github.com/zgeoff/nixie/commit/b45784a26737d84d685b83222ba0e8257db70989))

## [0.57.0](https://github.com/zgeoff/nixie/compare/v0.56.0...v0.57.0) (2026-10-29)


### Features

* **tasks:** pause, stop, restart, close and interrupt a task ([#724](https://github.com/zgeoff/nixie/issues/724)) ([79eb06b](https://github.com/zgeoff/nixie/commit/79eb06bb2b80e41df17f72ed5b262fe671fbb279))

## [0.56.0](https://github.com/zgeoff/nixie/compare/v0.55.0...v0.56.0) (2026-10-29)


### Features

* **memory:** let memory.edit move an item to another subject ([#723](https://github.com/zgeoff/nixie/issues/723)) ([7f8f9bc](https://github.com/zgeoff/nixie/commit/7f8f9bc261801184130f4dc168bfe170aacc26c4))

## [0.55.0](https://github.com/zgeoff/nixie/compare/v0.54.0...v0.55.0) (2026-10-29)


### Features

* **tasks:** start tasks from the conversation and route its messages ([#712](https://github.com/zgeoff/nixie/issues/712)) ([71b65b2](https://github.com/zgeoff/nixie/commit/71b65b277d42ad5af77eb9e75bd0a9b01f38426a))

## [0.54.0](https://github.com/zgeoff/nixie/compare/v0.53.0...v0.54.0) (2026-10-29)


### Features

* **contract:** publish the contract package to npm at each release ([#707](https://github.com/zgeoff/nixie/issues/707)) ([5adcfdc](https://github.com/zgeoff/nixie/commit/5adcfdc750a24a66cbfeadedccae9afa6855753e))

## [0.53.0](https://github.com/zgeoff/nixie/compare/v0.52.0...v0.53.0) (2026-10-29)


### Features

* **memory:** give recall a photo's image and let the model open it ([#706](https://github.com/zgeoff/nixie/issues/706)) ([7b90c9c](https://github.com/zgeoff/nixie/commit/7b90c9c8dcada12a7ddd935870ef0ad643e842d4))

## [0.52.0](https://github.com/zgeoff/nixie/compare/v0.51.0...v0.52.0) (2026-10-29)


### Features

* **memory:** mark an item sensitive so per-turn recall leaves it out ([#702](https://github.com/zgeoff/nixie/issues/702)) ([57b71c1](https://github.com/zgeoff/nixie/commit/57b71c1b352fc938098620774d03a5354367679d))

## [0.51.0](https://github.com/zgeoff/nixie/compare/v0.50.0...v0.51.0) (2026-10-28)


### Features

* **web:** browse, read, edit and destroy moments ([#698](https://github.com/zgeoff/nixie/issues/698)) ([862b982](https://github.com/zgeoff/nixie/commit/862b982d20a688b9baa7a77e00d2194a6b0d6f44))

## [0.50.0](https://github.com/zgeoff/nixie/compare/v0.49.2...v0.50.0) (2026-10-28)


### Features

* **memory:** read a moment as its conversation by default ([#697](https://github.com/zgeoff/nixie/issues/697)) ([0f8a9e8](https://github.com/zgeoff/nixie/commit/0f8a9e861819510e629b75987e3b99cd90730ce3))


### Bug Fixes

* run the skill-gate hook with bun --no-install ([#694](https://github.com/zgeoff/nixie/issues/694)) ([ff80b7b](https://github.com/zgeoff/nixie/commit/ff80b7b3d330e1936f9a0f33dad3425a32368501))

## [0.49.2](https://github.com/zgeoff/nixie/compare/v0.49.1...v0.49.2) (2026-10-28)


### Bug Fixes

* **deps:** update orpc monorepo to v1.16.0 ([#691](https://github.com/zgeoff/nixie/issues/691)) ([bcd70a8](https://github.com/zgeoff/nixie/commit/bcd70a8aa72735fcd0d6ae5bd767652c773bbe9f))
* **deps:** update patch updates ([#664](https://github.com/zgeoff/nixie/issues/664)) ([edecc7e](https://github.com/zgeoff/nixie/commit/edecc7e89116a2b05543e11281ca21d1d7035340))

## [0.49.1](https://github.com/zgeoff/nixie/compare/v0.49.0...v0.49.1) (2026-10-28)


### Bug Fixes

* **deps:** update qs to fix advisories ([#685](https://github.com/zgeoff/nixie/issues/685)) ([cf8aa5b](https://github.com/zgeoff/nixie/commit/cf8aa5b8bf1c85e188a499b20fc11ae84df80c77))


### Performance Improvements

* **server:** make the in-process start cheaper for tests ([#682](https://github.com/zgeoff/nixie/issues/682)) ([0428074](https://github.com/zgeoff/nixie/commit/0428074a9bbceb8df4806554621cef4db3cf25ff))

## [0.49.0](https://github.com/zgeoff/nixie/compare/v0.48.0...v0.49.0) (2026-10-26)


### Features

* **memory:** add the moment records, projections and store writes ([#673](https://github.com/zgeoff/nixie/issues/673)) ([518b81e](https://github.com/zgeoff/nixie/commit/518b81e07b4c1d3e4e57f38d548b849f021b6c24))
* **memory:** destroy a moment by shredding its own records' keys ([#675](https://github.com/zgeoff/nixie/issues/675)) ([625ad9c](https://github.com/zgeoff/nixie/commit/625ad9cbecd03821d3f9d85901c2326163bd615f))
* **memory:** give the conversation the six moment tools ([#674](https://github.com/zgeoff/nixie/issues/674)) ([1085687](https://github.com/zgeoff/nixie/commit/1085687392455613cf2750e3c00751b6e339ad04))
* **memory:** show moments in the status, the events and the export ([#676](https://github.com/zgeoff/nixie/issues/676)) ([fe1a46f](https://github.com/zgeoff/nixie/commit/fe1a46f93874cc848e8ce1467855aecf08cb3fbc))


### Bug Fixes

* **contract:** label a voice composition of several words unknown ([#679](https://github.com/zgeoff/nixie/issues/679)) ([11547da](https://github.com/zgeoff/nixie/commit/11547dadd71ed78b45a7a310b512d6c09cc7d845))

## [0.48.0](https://github.com/zgeoff/nixie/compare/v0.47.0...v0.48.0) (2026-10-26)


### Features

* **research:** measure the consent checker on real messages ([#669](https://github.com/zgeoff/nixie/issues/669)) ([8f70a9b](https://github.com/zgeoff/nixie/commit/8f70a9be49a7018099c563aa8c0cb75ec774034d))


### Bug Fixes

* **tasks:** open no wait for a question to a task on its own schedule ([#662](https://github.com/zgeoff/nixie/issues/662)) ([ae887e2](https://github.com/zgeoff/nixie/commit/ae887e27a38aa0690032ad74ea6dd3e17851cb22))

## [0.47.0](https://github.com/zgeoff/nixie/compare/v0.46.0...v0.47.0) (2026-10-25)


### Features

* **research:** choose what speaks a voice reply ([#650](https://github.com/zgeoff/nixie/issues/650)) ([ab4b32f](https://github.com/zgeoff/nixie/commit/ab4b32f41badc17d3fc1b45ee884aec133a43eb0))
* **tasks:** let tasks and the conversation message each other ([#654](https://github.com/zgeoff/nixie/issues/654)) ([68eef7c](https://github.com/zgeoff/nixie/commit/68eef7c8fd3ecd5b9f073f15300df1dad6a22f0b))


### Bug Fixes

* **deps:** update tanstack-router monorepo ([#607](https://github.com/zgeoff/nixie/issues/607)) ([b828e6d](https://github.com/zgeoff/nixie/commit/b828e6d3192931772be916bcd18c4ef883f194d2))
* **memory:** tell the model a self-note retires with no quote ([#653](https://github.com/zgeoff/nixie/issues/653)) ([fbc6efc](https://github.com/zgeoff/nixie/commit/fbc6efc2448dbdf7e27ccd8fae9cfc59e0b37acf))
* **sandbox-imp:** accept impd 5 beside impd 2, 3 and 4 ([#657](https://github.com/zgeoff/nixie/issues/657)) ([e58bc29](https://github.com/zgeoff/nixie/commit/e58bc29e61f48355d4f3614ee248fe0246b32506))

## [0.46.0](https://github.com/zgeoff/nixie/compare/v0.45.0...v0.46.0) (2026-10-24)


### Features

* **definitions:** export an approved prompt override as a pull request ([#632](https://github.com/zgeoff/nixie/issues/632)) ([b799dbf](https://github.com/zgeoff/nixie/commit/b799dbfe151cf1a160759fdce789d829374eef52))
* **prompts:** let the owner answer the model's prompt proposals ([#633](https://github.com/zgeoff/nixie/issues/633)) ([f1ac59d](https://github.com/zgeoff/nixie/commit/f1ac59dac146a99153846036a814ca84c7ae1740))
* **prompts:** record prompt proposals and their answers ([#624](https://github.com/zgeoff/nixie/issues/624)) ([c9de885](https://github.com/zgeoff/nixie/commit/c9de8853f031de1fffab1b214d25286b274bbade))

## [0.45.0](https://github.com/zgeoff/nixie/compare/v0.44.0...v0.45.0) (2026-10-24)


### Features

* **memory:** forget every memory item through reset --only memories ([#619](https://github.com/zgeoff/nixie/issues/619)) ([5cc8312](https://github.com/zgeoff/nixie/commit/5cc83129d0c4f0ec4d28449eb323ebdf9f8c03e1))
* **prompts:** add prompt_read and a check for a prompt proposal ([#623](https://github.com/zgeoff/nixie/issues/623)) ([294b555](https://github.com/zgeoff/nixie/commit/294b5556f524ab92a80fb946cabd57652a6c6f66))
* **research:** measure how a voice turn ends on real speech ([#640](https://github.com/zgeoff/nixie/issues/640)) ([85d7ce4](https://github.com/zgeoff/nixie/commit/85d7ce4d10da990779c72b13c1cecad07351a138))
* **server:** shred the conversation through reset --only conversations ([#620](https://github.com/zgeoff/nixie/issues/620)) ([4cd58b6](https://github.com/zgeoff/nixie/commit/4cd58b6a93827d53c779fd00a8851c87ab1f8da1))
* **web:** show no placeholder for a message whose text is shredded ([#621](https://github.com/zgeoff/nixie/issues/621)) ([9a4682f](https://github.com/zgeoff/nixie/commit/9a4682f888d7810fb40e783e2310f0dc71e99676))


### Bug Fixes

* **research:** keep a pause when its transcript fails ([#646](https://github.com/zgeoff/nixie/issues/646)) ([59f90d4](https://github.com/zgeoff/nixie/commit/59f90d4fe6ffbfe742cc50967efa6c974a880d27))

## [0.44.0](https://github.com/zgeoff/nixie/compare/v0.43.0...v0.44.0) (2026-10-24)


### Features

* **web:** ask for the microphone once so keyboard voice typing works ([#636](https://github.com/zgeoff/nixie/issues/636)) ([6e0093d](https://github.com/zgeoff/nixie/commit/6e0093d4bb59222f7f1f1417ed8672d9da5ef2a6))

## [0.43.0](https://github.com/zgeoff/nixie/compare/v0.42.0...v0.43.0) (2026-10-24)


### ⚠ BREAKING CHANGES

* this release reads definitions formats 2 and 3, and refuses format 1.

### Features

* override built-in prompts from a prompts map in nixie.yaml ([#595](https://github.com/zgeoff/nixie/issues/595)) ([b638e4f](https://github.com/zgeoff/nixie/commit/b638e4fc302ef6db6eb09fb7a302ff87bf9fa35a))
* **research:** measure retrieval on a deployment's own turns ([#634](https://github.com/zgeoff/nixie/issues/634)) ([ad0209b](https://github.com/zgeoff/nixie/commit/ad0209b9925580f65a28360b637fbabff6a69702))


### Bug Fixes

* **ci:** pass the shell, workflows and test timeouts checks ([#616](https://github.com/zgeoff/nixie/issues/616)) ([f404057](https://github.com/zgeoff/nixie/commit/f4040577c21b8ff409b956915bbf311cf54c3465))
* **memory:** list memory items newest first, one page per list ([#637](https://github.com/zgeoff/nixie/issues/637)) ([6383697](https://github.com/zgeoff/nixie/commit/6383697adcc875fe7ab9ed701edbde3e9818263c))
* **sandbox-imp:** accept impd 4 beside impd 2 and 3 ([#609](https://github.com/zgeoff/nixie/issues/609)) ([a76a2c9](https://github.com/zgeoff/nixie/commit/a76a2c9b86186030a308dc39c2fe88b2885d4321))

## [0.42.0](https://github.com/zgeoff/nixie/compare/v0.41.0...v0.42.0) (2026-10-24)


### ⚠ BREAKING CHANGES

* nixie grants model secrets under new names. A deployment stores each secret under its nixie-model- name and adds those names to the token's grantable list before it runs this release. Sandboxes created on the old names keep working until they are replaced.

### Features

* add backup and restore commands, and prefix model secrets ([#589](https://github.com/zgeoff/nixie/issues/589)) ([64915fc](https://github.com/zgeoff/nixie/commit/64915fc8ee641681233b69993335456bc60ecc4f))
* **deploy:** add a pulumi component for nixie's pod on kubernetes ([#577](https://github.com/zgeoff/nixie/issues/577)) ([1730535](https://github.com/zgeoff/nixie/commit/17305356814c77112f564223dfa6508063b488da))
* **deploy:** add the web client and the backup to the k8s component ([#578](https://github.com/zgeoff/nixie/issues/578)) ([438d29c](https://github.com/zgeoff/nixie/commit/438d29c2ea9b65b32e0b8c8f5bdd3a46ea34f2a7))
* **memory:** let the model and the writer set an end time on a memory ([#573](https://github.com/zgeoff/nixie/issues/573)) ([ee03aa9](https://github.com/zgeoff/nixie/commit/ee03aa9f2e48d314704a6b296f155104680ec12d))
* **memory:** tell the conversation when a memory item lapses ([#585](https://github.com/zgeoff/nixie/issues/585)) ([23aed26](https://github.com/zgeoff/nixie/commit/23aed261ca307c7b8b9a9d84abc065ecf3bd27ea))
* **preview:** hold the preview model's list prices in its profile ([#590](https://github.com/zgeoff/nixie/issues/590)) ([c2f9751](https://github.com/zgeoff/nixie/commit/c2f9751107984da2e9272230b8927dc2ec6a1e76))
* **skills:** vendor a published skill by definitions pull request ([#572](https://github.com/zgeoff/nixie/issues/572)) ([2626bc3](https://github.com/zgeoff/nixie/commit/2626bc3eefb17aa3258a61ec7cda28ca27d4a64a))


### Bug Fixes

* **counting-proxy:** price a long prompt at its long-prompt rates ([#588](https://github.com/zgeoff/nixie/issues/588)) ([0717fb8](https://github.com/zgeoff/nixie/commit/0717fb83bfdbcb11561ea8e2bcf1461039cb0328))
* **sandbox-imp:** accept impd 3 while nixie uses imp client 2 ([#598](https://github.com/zgeoff/nixie/issues/598)) ([fd2bd56](https://github.com/zgeoff/nixie/commit/fd2bd56d8bac0c654ed1546d206dd65096ac04ed))

## [0.41.0](https://github.com/zgeoff/nixie/compare/v0.40.0...v0.41.0) (2026-10-22)


### ⚠ BREAKING CHANGES

* **connectors:** run each web fetch in a sandbox of its own ([#530](https://github.com/zgeoff/nixie/issues/530))

### Features

* **connectors:** run each web fetch in a sandbox of its own ([#530](https://github.com/zgeoff/nixie/issues/530)) ([924b969](https://github.com/zgeoff/nixie/commit/924b969be1e8b4faf827783758e1cbba1378ac6e))
* **counting-proxy:** count model spend and refuse past a limit ([#566](https://github.com/zgeoff/nixie/issues/566)) ([8a1018c](https://github.com/zgeoff/nixie/commit/8a1018c509ff62c3d2a55e28a5e70afe15a6ae70))
* **db:** admit the pin operation in memory proposals ([#559](https://github.com/zgeoff/nixie/issues/559)) ([9dc1bc3](https://github.com/zgeoff/nixie/commit/9dc1bc314a37a43803a3770a5e99bb79237a7722))
* **definitions:** record the git-sync commit and repo in each seed ([#563](https://github.com/zgeoff/nixie/issues/563)) ([43cc476](https://github.com/zgeoff/nixie/commit/43cc476d495d44cce959369f327f423a46f4c957))
* **definitions:** template the skill export's title and message ([#554](https://github.com/zgeoff/nixie/issues/554)) ([6138075](https://github.com/zgeoff/nixie/commit/6138075eb9583ef4187f0db75b82144513aefeef))
* **memory:** add a pin proposal for an item the model asks to pin ([#562](https://github.com/zgeoff/nixie/issues/562)) ([e7dc2c4](https://github.com/zgeoff/nixie/commit/e7dc2c4e9f8c9b2e496e9cd3d40184222495f05e))
* **memory:** add memory.pin and memory.unpin for the model ([#564](https://github.com/zgeoff/nixie/issues/564)) ([583ac83](https://github.com/zgeoff/nixie/commit/583ac83d772cfd2091c70e77525bc514b5d08bac))
* **memory:** delete selected retired memory items in one checked action ([#558](https://github.com/zgeoff/nixie/issues/558)) ([5ca6adb](https://github.com/zgeoff/nixie/commit/5ca6adb3d212a175eb2c3bf7a7e37832a5e460b0))
* **memory:** let a deployment turn off the writer and the consolidator ([#569](https://github.com/zgeoff/nixie/issues/569)) ([d197999](https://github.com/zgeoff/nixie/commit/d1979994dd2f342a067927aa18121a3a72fb9b8d))
* **memory:** let a memory item with an end time lapse on its own ([#553](https://github.com/zgeoff/nixie/issues/553)) ([2f16522](https://github.com/zgeoff/nixie/commit/2f165225f72dc0fe4add1fcb89b9c299df3035ed))
* **memory:** show memory notices with undo, keep and retire ([#552](https://github.com/zgeoff/nixie/issues/552)) ([7970062](https://github.com/zgeoff/nixie/commit/797006287486c0bb090e35ae621271f768e5c3d6))
* **memory:** show the pinned count and tokens to the model ([#567](https://github.com/zgeoff/nixie/issues/567)) ([6a49f94](https://github.com/zgeoff/nixie/commit/6a49f94eb98dffd996c6004d0bafdbf65efac7ec))
* **server:** name the refused image in imp host readiness ([#556](https://github.com/zgeoff/nixie/issues/556)) ([3e541ba](https://github.com/zgeoff/nixie/commit/3e541badd7d58de10f7a042417f420c2fe74d88a))
* **web:** label each web fetch with the page it ended at ([#570](https://github.com/zgeoff/nixie/issues/570)) ([6d36f25](https://github.com/zgeoff/nixie/commit/6d36f252caa98a10a55d22630e306d4d558b1c5f))


### Bug Fixes

* **compose:** re-pin caddy to the rebuilt 2.11.7-alpine digest ([#546](https://github.com/zgeoff/nixie/issues/546)) ([c447b64](https://github.com/zgeoff/nixie/commit/c447b6412b19ae78b3a6d89d1a138164d2d9209f))
* **deps:** update @tanstack/react-start to v1.169.2 ([#538](https://github.com/zgeoff/nixie/issues/538)) ([2053513](https://github.com/zgeoff/nixie/commit/20535135722053ce7b7a1a7205dbb34aee3700bf))
* **testing:** treat a dead process state as gone in the process probe ([#542](https://github.com/zgeoff/nixie/issues/542)) ([8104fe0](https://github.com/zgeoff/nixie/commit/8104fe07231905fd218cb64688f8e88f5acbb6f0))

## [0.40.0](https://github.com/zgeoff/nixie/compare/v0.39.2...v0.40.0) (2026-10-21)


### Features

* **connectors:** read web fetch links as short ids kept per session ([#524](https://github.com/zgeoff/nixie/issues/524)) ([52161df](https://github.com/zgeoff/nixie/commit/52161df0defb2a51c03b6e9377e543a6694fdd89))

## [0.39.2](https://github.com/zgeoff/nixie/compare/v0.39.1...v0.39.2) (2026-10-21)


### Bug Fixes

* **definitions:** record an adopted skill and close its exports ([#504](https://github.com/zgeoff/nixie/issues/504)) ([3823934](https://github.com/zgeoff/nixie/commit/382393455ff9df02b7a9ce1531142f7e4d8f2459))
* scope the pre-push checks to the pushed commits ([#516](https://github.com/zgeoff/nixie/issues/516)) ([3948cb6](https://github.com/zgeoff/nixie/commit/3948cb6ce2133e0b287f7e7b8574eb5caaa679d0))

## [0.39.1](https://github.com/zgeoff/nixie/compare/v0.39.0...v0.39.1) (2026-10-21)


### Bug Fixes

* **definitions:** warn in a skill export pull request under format 1 ([#500](https://github.com/zgeoff/nixie/issues/500)) ([932d21d](https://github.com/zgeoff/nixie/commit/932d21df46bed3b065fdf1b22a58c1833664a366))
* keep a long web page inline as truncated text ([#503](https://github.com/zgeoff/nixie/issues/503)) ([cc94867](https://github.com/zgeoff/nixie/commit/cc94867bdab46c19d59efefc5d74bc342de3834f))

## [0.39.0](https://github.com/zgeoff/nixie/compare/v0.38.0...v0.39.0) (2026-10-21)


### Features

* **geo-1510:** export skills nixie writes as definitions pull requests ([#484](https://github.com/zgeoff/nixie/issues/484)) ([cec4833](https://github.com/zgeoff/nixie/commit/cec48333561a054672267224a0542f277738ea6f))
* **geo-1510:** lay skills nixie writes over the definitions ([#476](https://github.com/zgeoff/nixie/issues/476)) ([3cdbd6d](https://github.com/zgeoff/nixie/commit/3cdbd6d9aad0ebea2feb6a1406cf4a107966cfa1))
* **geo-1510:** open skill export pull requests through the github api ([#485](https://github.com/zgeoff/nixie/issues/485)) ([0c33d97](https://github.com/zgeoff/nixie/commit/0c33d977525f8cced10b39eaa0638bdeee555c61))
* **geo-1510:** put an approved skill in force at once ([#477](https://github.com/zgeoff/nixie/issues/477)) ([5020b18](https://github.com/zgeoff/nixie/commit/5020b18bcf0daadd67d0aa15096f919e1636c4ab))
* **geo-1510:** show and resolve written-skill conflicts ([#478](https://github.com/zgeoff/nixie/issues/478)) ([b4390ad](https://github.com/zgeoff/nixie/commit/b4390ad9fef5c74932d32466fce3acd51bdacf18))

## [0.38.0](https://github.com/zgeoff/nixie/compare/v0.37.0...v0.38.0) (2026-10-21)


### Features

* **geo-1168:** remove the image offer tools ([#472](https://github.com/zgeoff/nixie/issues/472)) ([6547bb2](https://github.com/zgeoff/nixie/commit/6547bb2f493613446d9fc8c9e0c8d2d0af0f2287))
* **geo-1168:** save a memory from a photo as a proposal ([#470](https://github.com/zgeoff/nixie/issues/470)) ([8b73603](https://github.com/zgeoff/nixie/commit/8b736037eb9b9901dc8608e670de37e5f781cdfd))
* **geo-1168:** show the photo beside a photo proposal ([#471](https://github.com/zgeoff/nixie/issues/471)) ([112c58b](https://github.com/zgeoff/nixie/commit/112c58bbcffd8eee5ce44fe8dd223767af393dfd))
* **geo-1446:** keep link targets in fetched page text ([#492](https://github.com/zgeoff/nixie/issues/492)) ([b09d79c](https://github.com/zgeoff/nixie/commit/b09d79cebad17559c70eb65f56e523975426115c))
* **geo-1511:** review skill proposals through host commands ([#464](https://github.com/zgeoff/nixie/issues/464)) ([a8c79f3](https://github.com/zgeoff/nixie/commit/a8c79f3a85ec1880bfa05ad4d58795ed4e68d8d8))
* **geo-1512:** list pending skill proposals with skill_pending ([#469](https://github.com/zgeoff/nixie/issues/469)) ([bc611ee](https://github.com/zgeoff/nixie/commit/bc611eecc8b2970213020d74aa527bd040ccfa86))


### Bug Fixes

* **deps:** update @tanstack/react-start to v1.169.1 ([#457](https://github.com/zgeoff/nixie/issues/457)) ([37041a9](https://github.com/zgeoff/nixie/commit/37041a9225e93c630eb81c181f47354d34d391bc))
* **deps:** update patch updates ([#418](https://github.com/zgeoff/nixie/issues/418)) ([ac9ef60](https://github.com/zgeoff/nixie/commit/ac9ef6000e95ed7cfa5ec254b3fe047c6461bc58))
* **deps:** update playwright-core to v1.64.0 ([#377](https://github.com/zgeoff/nixie/issues/377)) ([7d1ffbf](https://github.com/zgeoff/nixie/commit/7d1ffbf55991d5b2744589e2df50a1c62c713774))
* **geo-1495:** give nixie its own broker placeholder ([#468](https://github.com/zgeoff/nixie/issues/468)) ([6493aaa](https://github.com/zgeoff/nixie/commit/6493aaa0f7ea42aebd4f7505271c28a33058e707))
* **geo-1513:** run browser suites serially after the parallel run ([#458](https://github.com/zgeoff/nixie/issues/458)) ([75b4e01](https://github.com/zgeoff/nixie/commit/75b4e010b487a44b48f0a6cbd77fcc3b1c76b3fd))
* **geo-1517:** take the log page scan limit from the query ([#467](https://github.com/zgeoff/nixie/issues/467)) ([a2eae33](https://github.com/zgeoff/nixie/commit/a2eae334654bd27060321e219b3e60c46b96ab96))

## [0.37.0](https://github.com/zgeoff/nixie/compare/v0.36.0...v0.37.0) (2026-10-19)


### Features

* **geo-1319:** count memory subjects and dry-run the subjects migration ([#389](https://github.com/zgeoff/nixie/issues/389)) ([bc0c6cd](https://github.com/zgeoff/nixie/commit/bc0c6cd845c952aa7e924950392cec86720056bd))
* **geo-1319:** give each memory item a subject: owner, self or shared ([#387](https://github.com/zgeoff/nixie/issues/387)) ([376026e](https://github.com/zgeoff/nixie/commit/376026e1fcd8fb031e303c3beff95578a9739a6d))
* **geo-1319:** give the note-taker subjects and a self-note flag ([#397](https://github.com/zgeoff/nixie/issues/397)) ([61f94c7](https://github.com/zgeoff/nixie/commit/61f94c7dda44c8add6f6f97ed9e3c50df521da0c))


### Bug Fixes

* **geo-1478:** index only the words you typed in each past message ([#452](https://github.com/zgeoff/nixie/issues/452)) ([93753da](https://github.com/zgeoff/nixie/commit/93753da88e47d4838d2dc910072a896b13850cb4))

## [0.36.0](https://github.com/zgeoff/nixie/compare/v0.35.1...v0.36.0) (2026-10-19)


### Features

* **geo-1476:** publish the definitions manifest schema in each release ([#440](https://github.com/zgeoff/nixie/issues/440)) ([1da50a0](https://github.com/zgeoff/nixie/commit/1da50a0462511dab0c37e785173dd64aee54a988))
* **geo-391:** add skill_read and the skill reload tools ([#414](https://github.com/zgeoff/nixie/issues/414)) ([fdf2566](https://github.com/zgeoff/nixie/commit/fdf2566069d06e4b22840a9c56c8e37bc09f178b))
* **geo-391:** check and seed skills from definitions format 2 ([#411](https://github.com/zgeoff/nixie/issues/411)) ([5dd05ee](https://github.com/zgeoff/nixie/commit/5dd05ee7c2a8d5c62758f33406cecdd1436e1c6b))
* **geo-391:** propose skills that nixie writes with skill_write ([#415](https://github.com/zgeoff/nixie/issues/415)) ([2e617ad](https://github.com/zgeoff/nixie/commit/2e617ad0a69358b189c34d8a70b47f2d0f3189bb))
* **geo-391:** show a pinned skill catalog in the system prompt ([#413](https://github.com/zgeoff/nixie/issues/413)) ([03f84f6](https://github.com/zgeoff/nixie/commit/03f84f63d663a39d15d7299affec5645974da60a))

## [0.35.1](https://github.com/zgeoff/nixie/compare/v0.35.0...v0.35.1) (2026-10-19)


### Bug Fixes

* **geo-391:** deliver every checker prompt as written ([#410](https://github.com/zgeoff/nixie/issues/410)) ([707dff1](https://github.com/zgeoff/nixie/commit/707dff1f761a6c35dba4abb344f970e2612ae9a6))

## [0.35.0](https://github.com/zgeoff/nixie/compare/v0.34.0...v0.35.0) (2026-10-19)


### Features

* **geo-915:** record the model's reasoning summary and thinking tokens ([#420](https://github.com/zgeoff/nixie/issues/420)) ([2f87974](https://github.com/zgeoff/nixie/commit/2f879740d03ab9969225a131622bdc0338a621f4))


### Bug Fixes

* **geo-1166:** show the writer's model on writer-applied versions ([#423](https://github.com/zgeoff/nixie/issues/423)) ([f636037](https://github.com/zgeoff/nixie/commit/f636037df9fb6ed361fd18303b3b95301b67d562))
* **geo-1447:** report degraded, not unready, while a dependency fails ([#428](https://github.com/zgeoff/nixie/issues/428)) ([06ee24f](https://github.com/zgeoff/nixie/commit/06ee24f9a8469f73f2ffcbad0612baa305ed6299))

## [0.34.0](https://github.com/zgeoff/nixie/compare/v0.33.2...v0.34.0) (2026-10-19)


### Features

* **geo-1358:** warn the conversation before its session compacts ([#408](https://github.com/zgeoff/nixie/issues/408)) ([9d0d72a](https://github.com/zgeoff/nixie/commit/9d0d72aed1b3bdbe19491193d6fb57572e0006bb))

## [0.33.2](https://github.com/zgeoff/nixie/compare/v0.33.1...v0.33.2) (2026-10-18)


### Bug Fixes

* **geo-1359:** abort an impd readiness call that outlasts its timeout ([#404](https://github.com/zgeoff/nixie/issues/404)) ([89b1c83](https://github.com/zgeoff/nixie/commit/89b1c83f54700c9ddc49f24e220d48c6289da135))

## [0.33.1](https://github.com/zgeoff/nixie/compare/v0.33.0...v0.33.1) (2026-10-18)


### Bug Fixes

* **geo-1244:** answer readiness without calling impd per request ([#392](https://github.com/zgeoff/nixie/issues/392)) ([01508f9](https://github.com/zgeoff/nixie/commit/01508f90a935750ebba28cc0911aae54cddfee5d))

## [0.33.0](https://github.com/zgeoff/nixie/compare/v0.32.0...v0.33.0) (2026-10-18)


### Features

* **geo-556:** keep self-notes as their own kind of memory item ([#340](https://github.com/zgeoff/nixie/issues/340)) ([95ab010](https://github.com/zgeoff/nixie/commit/95ab0104a8876943a83945b1c712242f2cf12a50))


### Bug Fixes

* **deps:** pass the web and imp tests on bun 1.4.3 ([#385](https://github.com/zgeoff/nixie/issues/385)) ([f93db14](https://github.com/zgeoff/nixie/commit/f93db145f3250aa941b6cc7ea109dc47cb5e2192))
* **deps:** update patch updates ([#382](https://github.com/zgeoff/nixie/issues/382)) ([bdb3c50](https://github.com/zgeoff/nixie/commit/bdb3c509f93fe2e1a1806042baaf587b8c6903ed))

## [0.32.0](https://github.com/zgeoff/nixie/compare/v0.31.0...v0.32.0) (2026-10-17)


### Features

* **geo-1035:** add the nixie command and document impd names ([#329](https://github.com/zgeoff/nixie/issues/329)) ([a0df5ba](https://github.com/zgeoff/nixie/commit/a0df5ba55cbb13ff505788b1badbe15463d64404))
* **geo-1108:** retry unsent messages and stamp late ones ([#356](https://github.com/zgeoff/nixie/issues/356)) ([5928589](https://github.com/zgeoff/nixie/commit/5928589738b24d6442f5d4475464122abb32cf7d))
* **geo-724:** recognise domestic account numbers in the token check ([#333](https://github.com/zgeoff/nixie/issues/333)) ([68b5380](https://github.com/zgeoff/nixie/commit/68b5380041c07db80490d3e36a25e43def1b0bfb))
* **geo-857:** mark a reset in the conversation ([#358](https://github.com/zgeoff/nixie/issues/358)) ([2929e67](https://github.com/zgeoff/nixie/commit/2929e67f618427440bd44e110dc9eaa21415c61b))
* **geo-913:** pass the profile cache lifetime to the conversation cli ([#335](https://github.com/zgeoff/nixie/issues/335)) ([8da18d3](https://github.com/zgeoff/nixie/commit/8da18d3e301c28a5d5b56ba260cb9b546909d2e4))


### Bug Fixes

* **geo-1151:** seed the conversation turns part from stored errors ([#337](https://github.com/zgeoff/nixie/issues/337)) ([69bacad](https://github.com/zgeoff/nixie/commit/69bacad6eba313e69645dcfeb35fea20ed9b4bbf))
* **geo-1153:** skip a data file that is gone by the time it is read ([#339](https://github.com/zgeoff/nixie/issues/339)) ([5d05b4b](https://github.com/zgeoff/nixie/commit/5d05b4b1115fd9424aa1d7450be92903c9c50d83))
* **geo-1155:** remove a saved offer's key at start after a crash ([#327](https://github.com/zgeoff/nixie/issues/327)) ([4e37520](https://github.com/zgeoff/nixie/commit/4e37520afdd373a6ee6fe6e3eea3bdbae8964cae))
* **geo-1167:** accept a bsb pair whose account digits group otherwise ([#341](https://github.com/zgeoff/nixie/issues/341)) ([0e80430](https://github.com/zgeoff/nixie/commit/0e8043098bbbe1dcb74a8ccaef32828afbf161fb))
* **geo-1215:** fail a turn when the model refuses its credential ([#355](https://github.com/zgeoff/nixie/issues/355)) ([8412a4f](https://github.com/zgeoff/nixie/commit/8412a4f63791ddb834860bcab073c14a2268e62c))
* **geo-1218:** send the preview's model credential as a bearer header ([#350](https://github.com/zgeoff/nixie/issues/350)) ([950488c](https://github.com/zgeoff/nixie/commit/950488c9fe80159fa441e873592707ecf78b2c90))
* **geo-1219:** restart the preview server after a reset ([#359](https://github.com/zgeoff/nixie/issues/359)) ([6fc205e](https://github.com/zgeoff/nixie/commit/6fc205eca9b99a14b317f5fc85cc9a486678af20))
* **geo-1228:** keep the preview's model calls on the broker after any compose command ([#364](https://github.com/zgeoff/nixie/issues/364)) ([a33783c](https://github.com/zgeoff/nixie/commit/a33783c77c514ac18f8e09eb7d98d5406f059c38))
* **geo-556:** read a review reason a later release wrote as other ([#343](https://github.com/zgeoff/nixie/issues/343)) ([e1febca](https://github.com/zgeoff/nixie/commit/e1febcae000f7b0b98d76f71655d4cb0cabcbcca))
* **geo-877:** drop the cached step end a reset removed ([#365](https://github.com/zgeoff/nixie/issues/365)) ([54713d4](https://github.com/zgeoff/nixie/commit/54713d4ae4beb256c270c6b9fd11b1d456833554))


### Performance Improvements

* **geo-1162:** walk the memory export's pages in one loop ([#338](https://github.com/zgeoff/nixie/issues/338)) ([58701c1](https://github.com/zgeoff/nixie/commit/58701c1117fbeddc1f9436f42b2c9a45881b07ed))

## [0.31.0](https://github.com/zgeoff/nixie/compare/v0.30.0...v0.31.0) (2026-10-16)


### Features

* **geo-1124:** export every memory item to one json file ([#325](https://github.com/zgeoff/nixie/issues/325)) ([73680fa](https://github.com/zgeoff/nixie/commit/73680fab03e9b960e7dbfda7968761140a86df1b))

## [0.30.0](https://github.com/zgeoff/nixie/compare/v0.29.0...v0.30.0) (2026-10-16)


### Features

* **geo-1120:** review memory proposals in the web client ([#321](https://github.com/zgeoff/nixie/issues/321)) ([1f75b36](https://github.com/zgeoff/nixie/commit/1f75b36ac774a4f72ec5f550ef00e84c24ea7ee6))
* **geo-1122:** forget a memory item from the view and the cli ([#323](https://github.com/zgeoff/nixie/issues/323)) ([0371819](https://github.com/zgeoff/nixie/commit/037181917bd7104de829183dcaed0f0da46b85fb))
* **geo-533:** read memory items for the memory view ([#306](https://github.com/zgeoff/nixie/issues/306)) ([48851bc](https://github.com/zgeoff/nixie/commit/48851bca2314474acebb38288e180189e62f4be1))
* **geo-533:** retire, restore, pin and unpin from the memory view ([#310](https://github.com/zgeoff/nixie/issues/310)) ([d857622](https://github.com/zgeoff/nixie/commit/d857622e0881f0b7212791128e5d74e07723b589))
* **geo-533:** serve the memory view through the api ([#307](https://github.com/zgeoff/nixie/issues/307)) ([d1346e3](https://github.com/zgeoff/nixie/commit/d1346e30aea0c2eb7acf372ada75f8214db81506))
* **geo-533:** show every memory item in a web memory view ([#309](https://github.com/zgeoff/nixie/issues/309)) ([ebc77d5](https://github.com/zgeoff/nixie/commit/ebc77d5e9c38148bcfd68c8ed9176c2bf27e6a93))


### Bug Fixes

* **geo-1142:** name the impd error in failed turns, keep nixie routed ([#318](https://github.com/zgeoff/nixie/issues/318)) ([9afa077](https://github.com/zgeoff/nixie/commit/9afa0775c2db896bf6d9c9b6658000ce02c1a8dd))
* **geo-1146:** answer the 3 unanswered codex p1 findings ([#320](https://github.com/zgeoff/nixie/issues/320)) ([adbfb8b](https://github.com/zgeoff/nixie/commit/adbfb8b553c9ccc8ad8e01b5a16c96ea15374e07))
* **geo-1156:** keep the conversation page when react restarts its effect ([#324](https://github.com/zgeoff/nixie/issues/324)) ([8c3ac17](https://github.com/zgeoff/nixie/commit/8c3ac176841bb616cb181b9e36a420b28d33e183))

## [0.29.0](https://github.com/zgeoff/nixie/compare/v0.28.0...v0.29.0) (2026-10-16)


### Features

* **geo-1007:** type record kinds through a registry each module fills ([#302](https://github.com/zgeoff/nixie/issues/302)) ([bdf2c86](https://github.com/zgeoff/nixie/commit/bdf2c86680fd69688c3e4c591e01791557586388))
* **geo-1033:** wake in-process readers on a commit bus, not a poll ([#308](https://github.com/zgeoff/nixie/issues/308)) ([0b3259c](https://github.com/zgeoff/nixie/commit/0b3259cea7d0fb1f18af35114d2ff71b06663e28))
* **geo-1073:** retrieve memory items by meaning with a local encoder ([#295](https://github.com/zgeoff/nixie/issues/295)) ([ad08b15](https://github.com/zgeoff/nixie/commit/ad08b154298c62f391c5e881414ee9b0bc215de0))
* **geo-1126:** place matching past messages beside memory items ([#304](https://github.com/zgeoff/nixie/issues/304)) ([9a1c0ad](https://github.com/zgeoff/nixie/commit/9a1c0ad432ee83b09c199c61e919b82916033fbe))
* **geo-496:** add a compose reference recipe for the released images ([#315](https://github.com/zgeoff/nixie/issues/315)) ([24990f5](https://github.com/zgeoff/nixie/commit/24990f54943f942480b859d7de1c025472771036))
* **geo-927:** offer to remember an image and save it on a typed yes ([#299](https://github.com/zgeoff/nixie/issues/299)) ([e232631](https://github.com/zgeoff/nixie/commit/e232631a587680970a5c8804455415e7f97140bc))

## [0.28.0](https://github.com/zgeoff/nixie/compare/v0.27.0...v0.28.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* **geo-1086:** carry the release rules in the published config schema ([#290](https://github.com/zgeoff/nixie/issues/290))

### Features

* **geo-1009:** check each module's table types against its migrations ([#279](https://github.com/zgeoff/nixie/issues/279)) ([e57fe4c](https://github.com/zgeoff/nixie/commit/e57fe4cd27ec5d13243318ad77988d918cc90b00))
* **geo-1039:** decide each session step from one transition table ([#293](https://github.com/zgeoff/nixie/issues/293)) ([9a932de](https://github.com/zgeoff/nixie/commit/9a932de4a4bad6fb118c43fa379b4f0915491bb2))
* **geo-1039:** make nixie's compactor the only compactor ([#291](https://github.com/zgeoff/nixie/issues/291)) ([58c9f55](https://github.com/zgeoff/nixie/commit/58c9f55655cfba3887f2fb3267d13e2951863b31))
* **geo-1039:** serve the control socket from a typed host contract ([#292](https://github.com/zgeoff/nixie/issues/292)) ([f95f7df](https://github.com/zgeoff/nixie/commit/f95f7df0b37b5a5953fcd8a0d77e8e08b61f4f5f))
* **geo-1040:** run one action through the queue on every start ([#274](https://github.com/zgeoff/nixie/issues/274)) ([c8001fe](https://github.com/zgeoff/nixie/commit/c8001fecfd7e01dd45097590af3e148f71b93d10))
* **geo-1041:** publish release.json and a config schema per release ([#278](https://github.com/zgeoff/nixie/issues/278)) ([39783fb](https://github.com/zgeoff/nixie/commit/39783fb0ee28e5b13f46adc9d3ebb2c2181e2a46))
* **geo-1099:** pin each session to the persona it opened under ([#294](https://github.com/zgeoff/nixie/issues/294)) ([c47e26b](https://github.com/zgeoff/nixie/commit/c47e26b8d619e215a63088f4cdc06b22be97538f))
* **geo-923:** add a preview recipe that runs nixie on the test sandbox ([#276](https://github.com/zgeoff/nixie/issues/276)) ([4f3016b](https://github.com/zgeoff/nixie/commit/4f3016b3cc6410039134a7fc0bf444689d9e5faa))
* **geo-923:** select the test sandbox in the configuration ([#273](https://github.com/zgeoff/nixie/issues/273)) ([d0e597f](https://github.com/zgeoff/nixie/commit/d0e597f6142b5d69444ba2ec99c312b8d5f58273))


### Bug Fixes

* **geo-1079:** give each start's queue check an action of its own ([#289](https://github.com/zgeoff/nixie/issues/289)) ([c4b7874](https://github.com/zgeoff/nixie/commit/c4b78746f8973d71fd3c2c85c0e9bb5c6bbb8829))
* **geo-1086:** carry the release rules in the published config schema ([#290](https://github.com/zgeoff/nixie/issues/290)) ([c1330c0](https://github.com/zgeoff/nixie/commit/c1330c02a5dc878347380fb168cff3c8f071a976))
* **geo-1094:** count an is_error result as a failed bench turn ([#296](https://github.com/zgeoff/nixie/issues/296)) ([fd42d3e](https://github.com/zgeoff/nixie/commit/fd42d3ee55798a1ebf808ef18a1af74c06172669))
* **geo-1096:** bind the preview origin on every interface by default ([#297](https://github.com/zgeoff/nixie/issues/297)) ([d9bfaca](https://github.com/zgeoff/nixie/commit/d9bfacadb96f35b1450cf99938fa0388ca35e007))
* **sandbox-imp:** accept impd 2, which kept the 1.6 wire api ([#298](https://github.com/zgeoff/nixie/issues/298)) ([1cf26cd](https://github.com/zgeoff/nixie/commit/1cf26cd528f8bb784822e4c4f41a1894f42563b1))

## [0.27.0](https://github.com/zgeoff/nixie/compare/v0.26.0...v0.27.0) (2026-10-15)


### Features

* **geo-953:** show a tiny arrow on a summary marker that opens ([#267](https://github.com/zgeoff/nixie/issues/267)) ([2feb6f6](https://github.com/zgeoff/nixie/commit/2feb6f635e9987c40b4a44501d998d51b89f289a))


### Bug Fixes

* **geo-950:** cap a session's image count beside its image bytes ([#268](https://github.com/zgeoff/nixie/issues/268)) ([ea38551](https://github.com/zgeoff/nixie/commit/ea38551b7b7ca1255edc74f8c8bf150f9d7033fb))

## [0.26.0](https://github.com/zgeoff/nixie/compare/v0.25.0...v0.26.0) (2026-10-15)


### Features

* **geo-926:** attach images to a message ([#261](https://github.com/zgeoff/nixie/issues/261)) ([d3f27b6](https://github.com/zgeoff/nixie/commit/d3f27b6912b20ec980e3bcd61fb1663a707eca9c))

## [0.25.0](https://github.com/zgeoff/nixie/compare/v0.24.0...v0.25.0) (2026-10-15)


### Features

* **geo-944:** pin the summary marker closed as the compaction rule ([#264](https://github.com/zgeoff/nixie/issues/264)) ([5f0f8c5](https://github.com/zgeoff/nixie/commit/5f0f8c5e00ee226c6d38b0f2f5fd92dc56f6b2d5))

## [0.24.0](https://github.com/zgeoff/nixie/compare/v0.23.0...v0.24.0) (2026-10-15)


### Features

* **geo-873:** compact the conversation with nixie's own summary ([#258](https://github.com/zgeoff/nixie/issues/258)) ([accd7ba](https://github.com/zgeoff/nixie/commit/accd7ba7affb93ff00af2c7cd4a6bf0972c95923))


### Bug Fixes

* **geo-932:** correct the headless pass counts and bound each read ([#262](https://github.com/zgeoff/nixie/issues/262)) ([e399bac](https://github.com/zgeoff/nixie/commit/e399bacc845f5795bb6524aa589fb7e327d785fe))
* **geo-935:** keep a failed overflow summary in the log ([#263](https://github.com/zgeoff/nixie/issues/263)) ([7d56b08](https://github.com/zgeoff/nixie/commit/7d56b08b168dbbc92cd50bfecab022ada16de900))

## [0.23.0](https://github.com/zgeoff/nixie/compare/v0.22.0...v0.23.0) (2026-10-15)


### Features

* **geo-557:** forget a message or a reply from the client ([#236](https://github.com/zgeoff/nixie/issues/236)) ([c8d79d8](https://github.com/zgeoff/nixie/commit/c8d79d8e5c41822094822309b94f94069aabb68f))
* **geo-783:** take a reason when you reject a memory proposal ([#254](https://github.com/zgeoff/nixie/issues/254)) ([3f77833](https://github.com/zgeoff/nixie/commit/3f77833b2c47961d775f15251bb39cc1901d8455))
* **geo-914:** price 1-hour cache writes at their own profile price ([#252](https://github.com/zgeoff/nixie/issues/252)) ([206a352](https://github.com/zgeoff/nixie/commit/206a352527a74e189902908438d1949937743a0a))


### Bug Fixes

* **geo-895:** render the spike's messages as production does ([#248](https://github.com/zgeoff/nixie/issues/248)) ([413bd52](https://github.com/zgeoff/nixie/commit/413bd523b711b37b580081b69e22fd8ecde0768f))
* **geo-918:** skip format-codemod for files that .formatignore ignores ([#249](https://github.com/zgeoff/nixie/issues/249)) ([a759ff3](https://github.com/zgeoff/nixie/commit/a759ff318abbebb06130219a762afbbbe24e302b))
* **geo-920:** count a non-string connection as invalid ([#255](https://github.com/zgeoff/nixie/issues/255)) ([575d7fc](https://github.com/zgeoff/nixie/commit/575d7fc6eda63a728857f0c9fadcea716f15efb0))
* **geo-921:** keep sign-in on a launch from the app icon ([#256](https://github.com/zgeoff/nixie/issues/256)) ([5a6b869](https://github.com/zgeoff/nixie/commit/5a6b8693e274a873820e79d1ab98b366e5af8848))
* **geo-925:** drop a forgotten message from the outbox ([#253](https://github.com/zgeoff/nixie/issues/253)) ([d991c61](https://github.com/zgeoff/nixie/commit/d991c61066ca071f9f7fbcd6efd8c599001700be))

## [0.22.0](https://github.com/zgeoff/nixie/compare/v0.21.0...v0.22.0) (2026-10-15)


### Features

* **geo-511:** add log levels and a configured threshold ([#242](https://github.com/zgeoff/nixie/issues/242)) ([9365e85](https://github.com/zgeoff/nixie/commit/9365e85b9d4a635d466cc8fb16426c1135950b0e))
* **geo-785:** list memory changes in the events block ([#243](https://github.com/zgeoff/nixie/issues/243)) ([b746a1b](https://github.com/zgeoff/nixie/commit/b746a1b9074c006b7f3286e884a17771c2fa9c6a))
* **geo-866:** report the account name in the connector health check ([#234](https://github.com/zgeoff/nixie/issues/234)) ([11e3a7c](https://github.com/zgeoff/nixie/commit/11e3a7ceaf7247773f439e134cf43e5bc86d702d))
* **geo-883:** pass the result's terminal reason to the host ([#233](https://github.com/zgeoff/nixie/issues/233)) ([f6f1873](https://github.com/zgeoff/nixie/commit/f6f187314102badcde7b53c513271696a9bd278b))


### Bug Fixes

* **geo-831:** run the consolidator on a list cut at its budget ([#241](https://github.com/zgeoff/nixie/issues/241)) ([6aa3bbd](https://github.com/zgeoff/nixie/commit/6aa3bbd264e50a1aa827b283774646af2cc65814))
* **geo-864:** end a waiting fake forward when its test finishes ([#244](https://github.com/zgeoff/nixie/issues/244)) ([b026a21](https://github.com/zgeoff/nixie/commit/b026a216355d9fb74f529e61e4b1f96d49de5c39))
* **geo-878:** bind ratings past a turn note's recall ([#232](https://github.com/zgeoff/nixie/issues/232)) ([70a853e](https://github.com/zgeoff/nixie/commit/70a853e12132fecaac8063bb78cbe4ca2d7d3a79))
* **geo-884:** keep the turn boundary off the cli's overflow message ([#238](https://github.com/zgeoff/nixie/issues/238)) ([b7b5811](https://github.com/zgeoff/nixie/commit/b7b58117df1d54f1ee46a5d0922e5bb3c0394e8c))
* **geo-885:** refuse a context cap past the cli's assumed window ([#230](https://github.com/zgeoff/nixie/issues/230)) ([ff1e45e](https://github.com/zgeoff/nixie/commit/ff1e45eda648a50e3273adcd6d88e0189ad2b53e))

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
