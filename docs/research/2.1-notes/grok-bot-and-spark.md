# Grok Bot + Gemini Spark report (2.1.1)

Corrections: Grok Bot access = every paid individual Cursor plan + Cursor Teams + SuperGrok (FAQ). Spark announced I/O 2026-05-19 (US Ultra), global Ultra ~07-16, US Pro 07-24 — not August. Spark dedicated Gmail address not confirmed in help docs.

## Grok Bot (docs.x.ai/grok-bot/*)
- One persistent cloud computer per ACCOUNT, shared by all Bots (files, cookies, sessions, CLI creds). Durable work under /workspace; reset rebuilds from snapshot. Cursor auth/data settings. Up to 50 Bots.
- Background turns survive closing devices. Owner DM preempts/redirects current turn; queued instructions; Stop doesn't undo.
- Bot-to-Bot async messages; group chats 2-6 Bots. Turn resume after reset undocumented.
- Memory: per-Bot prefs/summaries; user reports markdown profile + dated logs on filesystem, no UI to view/edit (forum). Deleting Bot leaves files/logins.
- Approvals: Allow once / Always allow (creates rule) / Deny; Auto Review rules model-based, "Ask first wins". Rule storage docs contradictory. Local-machine exec defaults to ask. Takeover for passwords/2FA/CAPTCHA/payments; secret fields masked from transcript+context. Stripe Link single-use purchase approvals.
- Surfaces: desktop + mobile apps, voice dictation/chat/voice memos. No Slack/Telegram/email/phone conversation channel. Routines: schedule or events (Slack message, GitHub notification); 50 per Bot; only 20 most recent run records kept.
- Skills: written or recorded demo (≤10 min). Connectors via OAuth plugins; custom MCP must be public HTTP/SSE.
- Security: no Grok Bot CVE. Adjacent: grok.com "Cryptographic Context Injection" (Adversa, reported 2026-06-03, reproducible 08-19). Docs: "Do not use separate Bots as a security boundary".
- Copy: masked secrets + takeover; owner message preempts; Ask-first precedence; routine spec with owner/timezone/approval boundary/missing-data behaviour. Avoid: shared computer/creds; model-based auto review; 20-run history.

## Gemini Spark (support.google.com/gemini/answer/17094507, 17094710, 17094196, 17094296)
- Cloud, dedicated GCP VMs (TechCrunch); Gemini 3.5 Flash; Antigravity harness (third-party only). Remote browser + remote code exec sandboxes. Personal accounts, Keep Activity on; not EEA/UK/CH/NG.
- Task = thread; dashboard shows completed/current/planned steps, files touched, linked schedules. 15 concurrent tasks, 50 schedules; over cap = skipped not queued; times approximate.
- Memory: Personal Intelligence + past chats, in Google cloud.
- Confirms send/modify/purchase/form submit/sign-in/browser task start (shows sites + personal info). Credentials never typed in thread; takeover. AP2 payments (third-party). No standing rules/approval history documented. Google warns it cannot guarantee injection protection.
- Triggers: time schedules, Gmail-filter monitors, topic monitors (not for time-critical).
- Adjacent security: 2025 Gemini calendar-invite injection -> memory poisoning, exfil, smart home (Nassi et al.); Rehberger delayed tool invocation memory corruption.
- Copy: hard caps skip-not-queue shown to owner; step dashboard; confirmations showing data involved; email-filter triggers. Avoid: cloud-held data; undocumented enforcement; monitor reading untrusted email while able to act.
