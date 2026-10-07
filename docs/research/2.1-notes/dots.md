# OpenAI Dots

A dot is a persistent agent that runs GPT-6 Astra in the "dots harness", which OpenAI compares to
the Codex harness, on its own cloud Linux computer with a browser. A dot coordinates cloud threads,
background agents, and Work and Codex tasks, and it paces its own pauses and wakes. Its policy is a
set of owner rules with 4 behaviours plus fixed handoffs to the owner, but the confirmation policy
itself lives in model instructions. OpenAI holds all state, and the owner can reset memory but
cannot view, edit, or delete individual memories.

openai.com returned 403 during the research, so the primary sources are learn.chatgpt.com/docs/dots
and the pages under /codex/dots/, section 12 of the GPT-6 Astra system card, the MCP Events doc, and
the openai/codex repository and its issues.

## Where it runs

Each dot gets its own cloud Linux computer and browser. The openai/codex issues describe a 32 GB
filesystem and a `/workspace/shared` directory. The owner can connect a personal computer, which is
off by default. Credentials go through a secure form directly to the browser, with a Save to
Passwords option. OpenAI holds all state.

## Agent loop

A dot acts as a coordinator over cloud threads, background agents, and Work and Codex tasks, and
each of those tasks runs in its own conversation. The dot paces itself, pausing and waking on its
own. A time-budget setting bounds the work, and evaluations ran budgets from 4 minutes to 1 year.
The dot has a clock tool and a wait tool.

Pause stops only the main task. Children and schedules keep running, and no undo exists.

Durability is weak, according to openai/codex issues:

- Files vanished (issue 50985).
- A dot on standby treated a draft as final (issue 50482).
- A stuck task could not be stopped (issue 50785).
- `hostId` is durable metadata (issue 50671).

## Memory

A dot draws memory from the conversation, from its own notes, and from proactive research, which is
read-only. The dot's notes are separate from ChatGPT Memory. The memory is shared across ChatGPT,
Slack, and Teams.

The owner cannot view, edit, or delete individual memories; the only control is a reset.
Disconnecting an app does not delete the context the dot learned through it.

## Policy and approvals

The owner writes custom rules, each with a scope and one of 4 behaviours:

- act without asking
- act when you say so, labelled "if pre-approved"
- ask before acting
- hand off to the owner

Password changes and money transfers are fixed handoffs, and purchases need approval.

The confirmation policy is model instructions. OpenAI fixed red-team gaps by editing that text.

Auto-review runs a second model. The research inferred that this is the Codex guardian in
`codex-rs/core/src/guardian/decision.rs`, where a `None` decision falls back to asking the user. The
guardian does not store its outcome by tool-call ID.

Approvals do not cross delegation (issue 51349). OpenAI misalignment and misuse monitors can pause a
dot, and a P0 finding pages security.

## Channels and triggers

A dot talks to the owner through ChatGPT apps, voice calls in ChatGPT, Slack DMs and mentions, and
Teams DMs. The dot cannot call the owner. Texting is in beta for US Pro users through a third party.
A dot has no email address or phone number of its own, and it sends mail from the owner's account.

Each schedule sets a timezone, a cadence, notify conditions, and a destination, and the owner can
route each update to its own channel. The dot edits its own schedules through `automations.update`.

Events arrive through the MCP Events draft, which uses a callback URL, a `whsec_` secret, and a
single-use challenge.

## Extension model

Dots connect to more than 4,000 MCP-based apps. The ChatGPT app permissions apply, with scopes such
as read-only mail, and those permissions are shared across dots, ChatGPT, Work, and Codex. The
proactive research tools cannot send, change, or browse.

## Security record

The research confirmed no Dots security incident. Other reports stay unconfirmed or minor:

- A claim that a dot sent unapproved email is unverified.
- A false-positive cyber block arrived without an ID (issue 49700).
- The DevDay demo stalled.

The system card reports 0 successful attacks across 50,000 emails, 16,600 of which were attacks, and
0 across 2,638 iterative attacks. Scope violations rose from 8.6% to 19.7% as the task chain grew
from 5 to 10 tasks.

No first-party source links Steinberger or OpenClaw to Dots. OpenAI shut Operator on 2025-08-31 and
Atlas on 2026-08-09, according to Wikipedia.

## Worth borrowing

- A fail-closed reviewer: when the reviewer reaches no decision, the action goes to the owner.
- Proactive research that is read-only.
- Credentials kept away from the model.
- The 4-behaviour rule vocabulary, plus fixed handoffs.
- Signed MCP Events subscriptions.
- Per-update channel routing.

## Worth avoiding

- Policy written as prompt text.
- Memory the owner cannot read, with reset as the only control.
- Blocks without an ID, and no export.
- Approvals that do not cross delegation.
- A pause that leaves children running.
- State loss that nothing records.
- A main loop that both reads and sends mail.
