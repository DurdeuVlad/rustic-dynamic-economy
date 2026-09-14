# Changelog

All notable changes to **Rustic Dynamic Economy** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Initial project proposal, architecture specifications, and scaffolding.
- Technical architecture document ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)) defining:
  - In-memory trade price mutation via CustomNPCs `IRoleTrader.set()` intercepting `RoleEvent$TraderEvent`.
  - Core economic invariant: only currency ItemStacks fluctuate, traded item is strictly immutable.
  - "Top-2 Canonical Denominations with Directional Rounding" algorithm resolving 2-slot CustomNPCs vs 4-tier base-64 coin system.
  - Dynamic pricing mathematical model with bounded multiplier limits (`[0.5, 6.0]`), velocity caps, and linear time decay.
  - Demand-weighted thematic inventory pool rotation with guaranteed novelty wildcard slots.
  - Concurrency rules and safety protocol for embedded SQLite ledger (`world/data/rustic_economy.db`).
- SQLite 3 schema DDL ([`schema/001_init.sql`](schema/001_init.sql)) for `trade_events`, `item_demand`, and `active_slots` tables.
- Example YAML configuration policy ([`config/config.example.yaml`](config/config.example.yaml)) defining currency tiers, pricing defaults, rotation settings, and pilot NPC trade pools (Master Blacksmith Durand, Garth the Provisioner).
- Scaffolding and stubs for NeoForge 1.21.1 / KubeJS runtime scripts:
  - Event listener and trade mutation stub ([`server_scripts/dynamic_economy_core.js`](server_scripts/dynamic_economy_core.js)).
  - Top-2 coin conversion engine stub ([`server_scripts/currency_converter.js`](server_scripts/currency_converter.js)).
  - SQLite database manager interface stub ([`server_scripts/db_manager.js`](server_scripts/db_manager.js)).
  - In-game `/dynprice` command hierarchy stub ([`server_scripts/commands.js`](server_scripts/commands.js)).
  - Client GUI overlay menu placeholder ([`client_scripts/gui_overlay.js`](client_scripts/gui_overlay.js)).
