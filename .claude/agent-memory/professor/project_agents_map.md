---
name: Agent roster and responsibilities
description: All agents in the Spectrelink project, what each does, and their current maturity/status
type: project
---

## Agent Roster

### professor (this agent)
- **Role:** Senior technical mentor — upskills the developer, never implements directly
- **Memory location:** `/home/tavosol/spectrelink/.claude/agent-memory/professor/`
- **Status:** Active

### wallet-app-architect
- **Role:** Migrate the legacy solBundler REPL into the stateless `wallet-app` service
- **Memory location:** `/home/tavosol/spectrelink/.claude/agent-memory/wallet-app-architect/`
- **Source repo being migrated:** `/home/tavosol/cryptoProjects/solBundler`
- **Status:** Phase 1 (scan) and Phase 2 (stateless design) COMPLETE. Phase 3 (implementation) NOT YET STARTED.
- **Key output so far:** Full HTTP endpoint design, Postgres schema intent, stateful pattern mapping, confirmed network topology constraints.

### spectrelink-backend-engineer
- **Role:** Unknown — agent definition exists at `.claude/agents/spectrelink-backend-engineer.md` but no memory directory found yet
- **Status:** Defined, activity not yet observed

### solana-dev-specialist
- **Role:** Unknown — agent definition exists at `.claude/agents/solana-dev-specialist.md` but no memory directory found yet
- **Status:** Defined, activity not yet observed

## Agent Memory Locations

- `/home/tavosol/spectrelink/.claude/agent-memory/professor/` — this agent
- `/home/tavosol/spectrelink/.claude/agent-memory/wallet-app-architect/` — wallet migration agent
