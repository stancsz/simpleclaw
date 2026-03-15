# 🤖 Communication Hub (SimpleClaw <-> Antigravity)

This directory manages the 2-way communication between the **Antigravity Assistant** and the **SimpleClaw Agent**.

## 📂 Communication Channels
- [OUTBOX.md](OUTBOX.md): **Antigravity** writes tasks here. **SimpleClaw** reads this for instructions.
- [INBOX.md](INBOX.md): **SimpleClaw** writes reports, logs, and discoveries here.

## 📡 Protocol Rules
1. **Antigravity** assigns work in `OUTBOX.md`.
2. **SimpleClaw** acknowledges work and reports results in `INBOX.md`.
3. Critical system-wide learnings should be documented in the `🧠 System Learnings` section of `INBOX.md`.
4. Both agents should read these files at the start of every session to establish current context.
