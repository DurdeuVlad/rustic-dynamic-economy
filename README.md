# Rustic Dynamic Economy

> **Current Status:** `PROPOSAL - AWAITING TEAM APPROVAL`  
> *Scaffolding, database schema, and architectural specifications are established. No runtime implementation is active on live servers.*

---

## Overview

The **Rustic Dynamic Economy** project replaces static, flat-rate shopkeeper NPC prices on the **Rustic Craft 2 SMP** (NeoForge 1.21.1 / Java 21) with a live, demand-driven dynamic pricing and weighted inventory rotation engine.

An economy audit of the server showed that flat-rate NPCs caused severe economic imbalance: players dumping mass-farmed resources for fixed coin payouts triggered hyperinflation, while rare and valuable items had no price movement to reward scarcity.

This project delivers:
- **100% Server-Side Execution:** No client mods required; full compatibility with standard modpack installations.
- **In-Memory Live Updates:** In-memory trade price mutation via CustomNPCs' `IRoleTrader` API without server reloads.
- **Currency-Only Fluctuation:** The item being traded (`sold`) is strictly immutable; only the coin cost (`currency1`/`currency2`) changes with demand.
- **Embedded SQLite Ledger:** Reuses the server's established GriefLogger pattern for transactional trade logging and demand tracking.
- **Thematic Weighted Rotation:** NPCs draw visible inventory from a larger thematic pool weighted by player demand, preserving novelty with wildcard slots.
- **In-Game Administration:** Managed entirely via `/dynprice` commands and a centralized YAML policy file (`config/config.yaml`), with an optional future GUI menu.

---

## Core Technical Mechanism

1. **Trade Event Interception:**  
   Listens for `noppes.npcs.api.event.RoleEvent$TraderEvent` (a native, cancellable NeoForge event) via KubeJS server scripts.
2. **In-Memory Price Updates:**  
   Updates the trade slot via `IRoleTrader.set(int slot, IItemStack sold, IItemStack currency1, IItemStack currency2)` directly in memory, avoiding CustomNPCs Linked NPC files.
3. **Internal Integer Pricing:**  
   Calculates prices in a canonical base unit (1 Bronze coin). Coins are converted to physical ItemStacks only when rendering to trade slots.

---

## Currency System & The 2-Slot Constraint

The economy utilizes the four-tier coin system from `adys_decorations`:
- **Bronze Coin:** Base unit (Value: $1$)
- **Brass Coin:** $64$ Bronze ($64\times$)
- **Silver Coin:** $64$ Brass = $4,096$ Bronze ($4,096\times$)
- **Gold Coin:** $64$ Silver = $262,144$ Bronze ($262,144\times$)

### The Two-Slot Allocation Proposal
CustomNPCs trade slots only accept two currency ItemStacks (`currency1`, `currency2`), while an arbitrary price can span up to 4 base-64 coin denominations.

**Proposed Algorithm: "Top-2 Canonical Denominations with Directional Rounding"**
1. Identify the highest active coin denomination ($T_{\max}$) needed for the calculated Bronze price.
2. Assign Slot 1 to $T_{\max}$ and Slot 2 to the immediately lower denomination ($T_{\max - 1}$).
3. Round residual values below $T_{\max - 1}$ into Slot 2:
   - **Player Purchases (NPC Sell):** Round **UP** (Ceiling) to prevent undercharging.
   - **Player Sales (NPC Buy):** Round **DOWN** (Floor) to prevent infinite money exploits.
4. Normalize carry-over if rounding reaches 64 coins.
5. Result: 100% exact pricing for all trades $< 4,096$ Bronze; maximum variance $\le 0.78\%$ for high-tier items. Players never need more than 2 coin types for any trade.

*(Note: Proposal documented in full in [`docs/ARCHITECTURE.md`](file:///root/workspace/rustic-dynamic-economy/docs/ARCHITECTURE.md) and flagged for team confirmation).*

---

## Database Tracking & Safety Rules

Persisted in an embedded SQLite database at `world/data/rustic_economy.db`:
- **`trade_events`:** Historical audit log of every trade transaction.
- **`item_demand`:** Dynamic pricing state, multipliers, and rolling volume metrics.
- **`active_slots`:** Current visible slot mapping, ensuring persistence across server restarts.

> **CRITICAL CONCURRENCY RULE:**  
> External tools, scripts, and AI agents may only run **read-only** queries against this database while the Minecraft server is live. All write operations are strictly mediated by the live server game process.

---

## Repository Structure

```
rustic-dynamic-economy/
├── .gitignore
├── README.md
├── docs/
│   └── ARCHITECTURE.md           # Full technical architecture specification
├── schema/
│   └── 001_init.sql              # SQLite DDL for trade_events, item_demand, active_slots
├── config/
│   └── config.example.yaml       # Example policy configuration for trade pools & bounds
├── server_scripts/
│   ├── dynamic_economy_core.js   # Event listeners and trade mutation scaffolding
│   ├── currency_converter.js     # Top-2 slot coin conversion engine
│   ├── db_manager.js             # SQLite manager interface & safety guards
│   └── commands.js               # /dynprice command hierarchy scaffolding
└── client_scripts/
    └── gui_overlay.js            # Optional Phase 7 GUI screen scaffolding
```

---

## Implementation Roadmap

- [ ] **Phase 1: Core Event Hook** – Intercept `TraderEvent`, test live `IRoleTrader.set()` in-memory update with hardcoded values on 1 test NPC.
- [ ] **Phase 2: SQLite Schema & Tracking** – Initialize database tables and wire real trade events to `trade_events`.
- [ ] **Phase 3: Dynamic Pricing Engine** – Apply bounded multiplier math ($[0.5, 6.0]$) and 2-slot coin conversion to live trades.
- [ ] **Phase 4: Weighted Inventory Rotation** – Demand-weighted pool sampling with starvation decay and guaranteed wildcard slots.
- [ ] **Phase 5: Commands & YAML Policy** – Implement `/dynprice` subcommands and SnakeYAML policy loader.
- [ ] **Phase 6: Staging Pilot** – Snapshot existing NPC configurations and deploy on 2-3 pilot NPCs on `mc-staging-server`.
- [ ] **Phase 7: GUI Menu (Optional)** – In-game administrative container screen via `RegisterMenuScreensEvent`.
- [ ] **Phase 8: Full Server Rollout** – Migrate remaining CustomNPCs shopkeepers following pilot validation.

---

## Open Decisions for Team Review

1. **Rotation Interval:** Trigger rotation on server restart vs. scheduled in-session intervals (e.g. daily Minecraft dawn / 24,000 ticks).
2. **Curve Tuning:** Baseline sensitivity ($S = 0.05$) and decay rates ($\lambda = 0.02/\text{hr}$) pending staging pilot telemetry.
3. **Currency Slot Design:** Final team signoff on the Top-2 Denomination coin distribution model.
