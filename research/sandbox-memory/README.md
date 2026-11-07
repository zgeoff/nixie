# Spike: where each sandbox's memory goes

nixie runs each conversation, each system task and each web fetch in a sandbox of its own: an imp, a
microVM that the impd daemon creates, sleeps and wakes. This spike finds the memory size at which
each kind of imp passes, where that memory goes, and how much host RAM impd holds for each awake
imp. An imp passes at a size when every scenario in it ends with no out-of-memory kill.

## Question

What size does each kind of sandbox need, and what does each way to cut it cost in security?

## Answer

The spike started from 2048 MiB for the conversation, 1024 MiB for each system task and 512 MiB for
each fetch: 6144 MiB for a busy deployment of 1 conversation, 2 tasks and 4 fetches.

- Each guest, the kernel and every process in the imp, used a fifth of its size or less. The
  conversation passed at 320 MiB, with 186 MiB of anonymous memory at its peak, and failed once at
  256 MiB. A system task passed at 384 MiB, and a fetch at 192 MiB, alone and 4 at once.
- On a host with 2 MiB huge pages on, impd holds each awake imp's whole size, whatever the guest
  uses. This spike didn't measure a host with huge pages off.
- The Agent SDK's `claude` CLI process held 195–219 MiB of resident memory, 90 MiB of it its
  binary's pages. Its host `bun` process held 62–69 MiB, and a `bun build` bundle cut that to 48 MiB
  and its start by 100 ms. A smaller image saves disk, not RAM.
- Shared imps, one of 768 MiB for the conversation and its tasks and one of 192 MiB for 4 fetches,
  would take 960 MiB. The jobs in each imp would share credentials and a kernel.

Size the conversation at 512 MiB, for real tool results larger than the stub's. Size each system
task at 384 MiB and each fetch at 192 MiB, with one imp per job, and bundle the conversation's code.
A busy deployment then takes 2048 MiB.

## Run it

Run each command from the repo root. `probe.sh` creates a test imp, runs one scenario in it, and
removes the imp.

1. Install the spike's packages with `bun install --cwd research/sandbox-memory`.
2. Run one scenario. The 3 arguments after the image name are the imp's memory in MiB, its vCPUs and
   the scenario script, and any further arguments go to the script.

   ```bash
   MODEL_SECRET=<model_key_secret> bash research/sandbox-memory/probe.sh \
     <conversation_image> 512 2 conversation.sh > <output_file> 2>&1
   ```

   - `<model_key_secret>`: the impd secret that holds the model API key. `probe.sh` grants it to the
     test imp alone. Every scenario on the conversation image except `idle.sh` needs it.
   - `<conversation_image>` and `<fetch_image>`: the impd names of nixie's 2 guest images.
   - `<output_file>`: any local file for the scenario's output.

   Expect: the output that [scenarios](results.md#scenarios) lists, with each scenario's arguments.

3. Time 5 creates and wakes of one image at one memory size and vCPU count:

   ```bash
   bash research/sandbox-memory/time-starts.sh <image> <memory_mib> <vcpus> 5 > <output_file> 2>&1
   ```

   Expect: 5 `run=` lines, each with `create_to_exec_ms` and 2 wake times.

4. Test the scripts with `bun test --cwd research/sandbox-memory`. Expect: 4 pass.

## Results

The [results](results.md) hold every figure, each measure, the versions and each change's cost.

## Untested

This spike never tested how well one imp keeps its processes apart, which a shared imp would rely
on. The [untested list](results.md#untested) gives the rest.
