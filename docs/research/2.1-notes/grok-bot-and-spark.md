# Grok Bot and Gemini Spark

Grok Bot and Gemini Spark are cloud-hosted personal agents from xAI and Google. Grok Bot gives each account one persistent cloud computer that all of its Bots share, and it gates actions with owner approvals, model-based auto-review rules, and owner takeover for secrets. Gemini Spark runs tasks on dedicated cloud VMs, shows each task's steps on a dashboard, and asks for confirmation before it sends, buys, or signs in. Both keep the owner's data in the vendor's cloud.

## Grok Bot

The sources are the pages under docs.x.ai/grok-bot/. Access comes with every paid individual Cursor plan, Cursor Teams, and SuperGrok, according to the Grok Bot FAQ.

### Where it runs

Each account gets 1 persistent cloud computer, which all of its Bots share: files, cookies, sessions, and CLI credentials. Durable work lives under `/workspace`, and a reset rebuilds the computer from a snapshot. Cursor settings govern authentication and data. An account can hold up to 50 Bots.

### Agent loop

Background turns keep running after the owner closes their devices. A direct message from the owner preempts or redirects the current turn, and further instructions queue behind it. Stop does not undo.

Bots send each other asynchronous messages, and a group chat holds 2 to 6 Bots. The docs do not say how a turn resumes after a reset.

### Memory

Each Bot keeps its own preferences and summaries. A user on the forum reports a markdown profile and dated logs on the filesystem, with no UI to view or edit them. Deleting a Bot leaves its files and logins behind.

### Policy and approvals

An approval prompt has 3 options: Allow once, Always allow, and Deny. Always allow creates a rule. Auto Review rules are model-based, and when rules conflict, "Ask first" wins. The docs contradict each other on where rules are stored. Execution on the owner's local machine defaults to ask.

The owner takes over the session for passwords, 2FA, CAPTCHAs, and payments. Grok Bot masks secret fields from both the transcript and the model context. Purchases through Stripe Link need a single-use approval.

### Channels and triggers

The owner reaches a Bot through the desktop and mobile apps, with voice dictation, voice chat, and voice memos. Grok Bot has no Slack, Telegram, email, or phone channel for conversation.

Routines run on a schedule or on events, such as a Slack message or a GitHub notification. Each Bot holds up to 50 routines, and Grok Bot keeps only the 20 most recent run records.

### Extension model

The owner creates a skill by writing it or by recording a demo of up to 10 minutes. Connectors are OAuth plugins. A custom MCP server must be public and speak HTTP or SSE.

### Security record

No Grok Bot CVE exists. An adjacent finding hit grok.com: Adversa reported "Cryptographic Context Injection" on 2026-06-03, and it was reproducible on 2026-08-19. The docs say: "Do not use separate Bots as a security boundary".

### What nixie copies

- Masked secrets, plus owner takeover for secret entry.
- An owner message that preempts the current turn.
- "Ask first" precedence when rules conflict.
- A routine spec that records the owner, the timezone, the approval boundary, and the behaviour when data is missing.

### What nixie avoids

- One computer and one set of credentials shared by every agent.
- Model-based auto-review.
- A run history capped at 20 records.

## Gemini Spark

The sources are the Gemini help pages at support.google.com/gemini/answer/17094507, 17094710, 17094196, and 17094296. Google announced Spark at I/O on 2026-05-19 for US Ultra subscribers, opened it to Ultra subscribers globally around 07-16, and to US Pro subscribers on 07-24, so none of these launches fell in August. The help docs do not confirm that Spark gets a dedicated Gmail address.

### Where it runs

Spark runs in the cloud on dedicated GCP VMs, according to TechCrunch. It uses Gemini 3.5 Flash and the Antigravity harness; only third-party sources state the harness. Each task gets a remote browser sandbox and a remote code execution sandbox. Spark requires a personal account with Keep Activity on, and it is unavailable in the EEA, the UK, Switzerland, and Nigeria.

### Agent loop

A task is a thread. The dashboard shows the completed, current, and planned steps, the files the task touched, and the linked schedules. An account runs at most 15 concurrent tasks and 50 schedules. Spark skips work over a cap rather than queueing it, and schedule times are approximate.

### Memory

Spark draws on Personal Intelligence and past chats, both held in Google's cloud.

### Policy and approvals

Spark asks for confirmation before it sends, modifies, purchases, submits a form, signs in, or starts a browser task. The confirmation shows the sites and personal information involved. The owner never types credentials into the thread and takes over the session instead. Payments go through AP2, which only third-party sources describe.

The docs describe no standing rules and no approval history. Google warns that it cannot guarantee protection against prompt injection.

### Channels and triggers

Spark runs on 3 kinds of trigger:

- time schedules
- monitors driven by Gmail filters
- topic monitors, which Google says are not for time-critical work

### Security record

The adjacent findings come from Gemini, not Spark. In 2025, Nassi et al. showed a Gemini calendar-invite injection that led to memory poisoning, exfiltration, and smart-home control. Rehberger showed memory corruption through delayed tool invocation.

### What nixie copies

- Hard caps that skip work rather than queue it, with the skip shown to the owner.
- A step dashboard.
- Confirmations that show the data involved.
- Triggers driven by email filters.

### What nixie avoids

- Owner data held in the vendor's cloud.
- Enforcement the docs do not describe.
- A monitor that reads untrusted email while able to act.
