# Contributing to Rustic Dynamic Economy

Rustic Dynamic Economy is a server-side dynamic pricing and weighted inventory rotation engine designed for the **Rustic Craft 2 SMP** (NeoForge 1.21.1 / Java 21).

> **Current Status: PROPOSAL & SCAFFOLDING**  
> This repository is currently an **architectural proposal and scaffolding specification**. There is no working runtime implementation deployed yet. The repository contains technical architecture documentation ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)), the SQLite DDL schema ([`schema/001_init.sql`](schema/001_init.sql)), an example configuration policy ([`config/config.example.yaml`](config/config.example.yaml)), and stub KubeJS server and client scripts with `TODO` markers.

This project intentionally follows the collaboration discipline established in [GatehouseMC](https://github.com/DurdeuVlad/GatehouseMC) and [HeapHammer](https://github.com/DurdeuVlad/heaphammer): clear architectural boundaries, test-first behavior changes, real-server staging verification, structured issue contracts, and transparent AI-assisted development.

---

## 1. Read first

Before submitting proposals, opening issues, or writing code, read:

1. [`README.md`](README.md) — High-level problem summary and feature overview
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — The authoritative technical specification, mathematical models, and implementation roadmap
3. [`schema/001_init.sql`](schema/001_init.sql) — SQLite 3 relational schema for trade logging, demand metrics, and slot persistence
4. [`config/config.example.yaml`](config/config.example.yaml) — Currency tiers, dynamic bounds, rotation policies, and NPC candidate pools
5. **Open Decisions Pending Team Confirmation** (Section 9 of [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)) — The active discussion items that form the starting point for contributors wanting to help implement the project.

> **Note on Session Artifacts:**  
> Development session logs and Flux execution artifacts (such as `.flux/sessions/2026-09-14_134652_rustic-dynamic-economy/`) exist in a separate internal workspace repository, not in this public repository. Contributors should not assume `.flux/` paths exist in this tree or reference them in pull requests.

---

## 2. Development prerequisites & How to build/run

**Honest disclosure:** There is currently no runnable mod or working code in this repository. Nothing is implemented yet beyond architectural specs, database DDL, and stub scripts.

When implementation begins, the execution and testing environment is:

- **Target Server:** Rustic Craft 2 SMP (`mc-staging-server` for pilot testing)
- **Runtime Environment:** Minecraft 1.21.1 / NeoForge on Java 21 (Temurin/OpenJDK recommended)
- **Scripting Engine:** KubeJS (JavaScript runtime for NeoForge server and client events)
- **Mod Dependencies:**
  - `CustomNPCs-Unofficial-NeoForge` (provides `IRoleTrader`, `RoleEvent$TraderEvent`, NPC role APIs)
  - `adys_decorations` (provides Bronze, Brass, Silver, and Gold coin items)
  - `kiwi` / `cloth-config` (provides SnakeYAML runtime for YAML policy loading)
  - Embedded SQLite 3 JDBC driver

There is no local Gradle wrapper or independent build step in this repository because KubeJS scripts are evaluated directly by the NeoForge server process at runtime. Staging verification will occur directly on `mc-staging-server`.

---

## 3. Architecture rules for contributors

### The Core Economic Invariant
**Only the currency ItemStacks (`currency1`, `currency2`) fluctuate in a trade. The item being traded (`sold`) must NEVER be modified or scaled.**
- When players dump supply by selling to an NPC, the NPC pays fewer coins; the quantity purchased remains static.
- When players buy rare goods, the NPC demands more coins; the item quantity offered remains unchanged.

### Currency decomposition (Top-2 Denomination Algorithm)
CustomNPCs trade slots only accept two currency ItemStacks (`currency1` and `currency2`), while prices span up to 4 base-64 coin tiers. All currency calculations must follow the Top-2 Canonical Denominations algorithm:
- Residual values below $T_{\max - 1}$ must use **directional rounding**:
  - **Player Purchases (NPC Sell):** Round **UP** (ceiling) to prevent undercharging.
  - **Player Sales (NPC Buy):** Round **DOWN** (floor) to prevent infinite money / duplication exploits.

### Embedded SQLite concurrency safety
The SQLite database (`world/data/rustic_economy.db`) is embedded:
- **Server Write Exclusivity:** Only the active Minecraft server process (via KubeJS / server thread pool) has authority to write to SQLite.
- **External Queries Read-Only:** External tools, cron jobs, analysis scripts, or AI assistants may only run **read-only** queries (`PRAGMA query_only = ON;`). Writing to the active SQLite file from outside the live server process will corrupt WAL state and is strictly forbidden.

### 100% Server-side execution
The dynamic economy engine (Phases 1 through 6) must remain strictly server-side. Do not introduce mandatory client-side mod requirements or custom network packets.

---

## 4. Implementation roadmap & starting points

Implementation is structured into sequential phases documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#8-rollout-strategy--phased-roadmap):

- **Phase 1: Core Event Hook** — Intercept `RoleEvent$TraderEvent` and verify live in-memory slot mutation via `IRoleTrader.set()` on 1 test NPC.
- **Phase 2: SQLite Schema & Tracking** — Initialize SQLite tables and record trades to `trade_events` asynchronously.
- **Phase 3: Dynamic Pricing Engine** — Wire multiplier calculations (`[0.5, 6.0]`), velocity caps (`max_single_trade_delta`), and 2-slot coin conversion to live trades.
- **Phase 4: Weighted Inventory Rotation** — Implement demand-weighted slot selection, starvation decay, and wildcard slot preservation.
- **Phase 5: Commands & YAML Policy** — Complete `/dynprice` subcommands and SnakeYAML policy loader.
- **Phase 6: Staging Pilot** — Deploy on 2–3 pilot NPCs (Durand the Blacksmith, Garth the Provisioner) on `mc-staging-server`.
- **Phase 7: GUI Menu (Optional)** — In-game admin container UI.
- **Phase 8: Full Server Rollout** — Server-wide rollout following pilot validation.

Contributors wishing to contribute code should start by discussing the **Open Decisions** in Section 9 of [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and tackling Phase 1 milestones.

---

## 5. Branching and commits

Recommended branch naming:

```text
feat/<phase-or-feature>
fix/<issue>-<short-name>
docs/<topic>
test/<surface>
```

Use Conventional Commits:

```text
feat(core): intercept TraderEvent and verify in-memory slot mutation
feat(currency): implement Top-2 coin decomposition with directional rounding
fix(db): enforce read-only pragma on external inspection connections
docs(architecture): clarify rotation interval options
```

Do not push directly to the default `main` branch.

---

## 6. What a high-value issue contains

A useful issue should include:

- Precise title describing the problem or proposal;
- Component involved (`server_scripts`, `docs`, `schema`, `config`, `client_scripts`);
- Target environment details (NeoForge 1.21.1 / Java 21 / KubeJS);
- Clear description of the specification defect, economic imbalance, or edge case;
- Expected vs. observed behavior;
- For currency or math issues: exact Bronze numbers, coin counts, and rounding calculations;
- Redacted server logs or SQL errors where applicable (no secrets or credentials).

---

## 7. Agent / milestone task contract

When writing an implementation task for Codex, Antigravity, or another coding agent, include:

1. **Strategic intent** — why this change matters.
2. **Expected responsibilities** — concrete behavior to implement.
3. **Anti-assumptions** — what the agent must not infer, alter, or break.
4. **Expected boundaries** — specific files/scripts allowed to change.
5. **Executable acceptance criteria** — verifiable assertions, queries, or event logs proving completion.

Example:

```markdown
### Intent
Implement Phase 1 TraderEvent listener with in-memory slot update validation.

### Responsibilities
- Register NativeEvents.onEvent for 'noppes.npcs.api.event.RoleEvent$TraderEvent'
- Retrieve IRoleTrader role from event.npc
- Update trade slot in-memory via IRoleTrader.set()
- Verify CustomNPCs client container UI synchronizes without server reload

### Must not
- Modify event.sold item definition (currency-only fluctuation invariant)
- Rely on CustomNPCs Linked NPC files
- Execute blocking I/O on the server tick thread

### Proof
- Staging server trade test on Master Blacksmith Durand
- Currency items update immediately in trade window upon completion
```

---

## 8. Pull request checklist

Before requesting review:

- [ ] Relevant documentation in `docs/` updated if behavior or specifications changed.
- [ ] Core economic invariant preserved: only currency slots change, traded item is strictly immutable.
- [ ] Directional rounding preserved: ceiling for player purchases, floor for player sales.
- [ ] SQLite safety rules respected: server-only writes, read-only queries for external access.
- [ ] KubeJS scripts pass syntax validation.
- [ ] No secrets, credentials, player IPs, or runtime SQLite database files included in diff.
- [ ] Staging verification plan documented for runtime changes.
- [ ] AI assistance disclosed when applicable.

---

## 9. AI-assisted contributions

AI-assisted engineering is welcome, but the contributor remains responsible for correctness.

Suggested disclosure:

```markdown
> 🤖 **AI Disclosure:** This contribution was developed with AI pair-programming assistance (tool/model: <name>). The implementation was reviewed and the documented verification steps were executed against the resulting code.
```

Never submit code based on hallucinated mod APIs. "The model said CustomNPCs has this method" is not evidence — verify class names, event signatures, and methods against actual mod JARs (`CustomNPCs-Unofficial-NeoForge.jar`, `kubejs-neoforge.jar`).

---

## 10. Security-sensitive changes

Treat these as security-sensitive and review with extreme care:

- Currency rounding and carry-over math (potential coin duplication / infinite money exploits)
- Dynamic pricing multipliers and boundary clamps (`min_multiplier`, `max_multiplier`, `max_single_trade_delta`)
- SQLite query construction (prevent SQL injection; all queries must be parameterized)
- Permission checks on administrative commands (`/dynprice` requires level 2 OP permission)
- Embedded database file concurrency and WAL integrity

Never post server credentials, database dumps, or unredacted server logs in public issues or PRs.

---

## 11. Documentation style

Permanent documentation describes implemented or accepted specifications, not speculative scratch work.

Keep documentation in `docs/` clean, precise, and authoritative.
