# Security Policy

Report security issues privately to the repository maintainers. Do not publish server credentials, database files, or unredacted logs in a public issue.

If you discover an exploit (economic duplication, currency rounding flaws, concurrency bugs, or permission bypasses), report it privately to `@DurdeuVlad` via GitHub Security Advisories at [`https://github.com/DurdeuVlad/rustic-dynamic-economy/security/advisories/new`](https://github.com/DurdeuVlad/rustic-dynamic-economy/security/advisories/new) or direct maintainer contact.

## Concurrency and Database Integrity

The embedded SQLite ledger (`world/data/rustic_economy.db`) is subject to a strict concurrency invariant:
- **Exclusive Server Write Authority:** The live Minecraft server process (via KubeJS / server thread pool) has sole write authority to the database file.
- **External Queries Read-Only:** Any external script, cron job, or admin tool inspecting the database while the server is running must execute in read-only mode (`PRAGMA query_only = ON;`). Direct external writes to an active database file will corrupt WAL state and are strictly prohibited.

## Economic Exploit Prevention

Economic integrity on Rustic Craft 2 SMP depends on strict trade invariants:
- **Directional Rounding:** Residual coin values below $T_{\max - 1}$ must always round UP (ceiling) on player purchases from NPCs to prevent undercharging, and round DOWN (floor) on player sales to NPCs to prevent infinite money or coin generation exploits.
- **Item Invariance:** Dynamic pricing only mutates currency slot ItemStacks (`currency1`, `currency2`). The item being traded (`sold`) must never be modified or scaled.
- **Velocity Clamping:** Single-trade multiplier jumps are capped by `max_single_trade_delta` to prevent market manipulation or burst dumping exploits.

## Data Handled

The `trade_events` audit table records player display names, Minecraft player UUIDs, trade timestamps, NPC identifiers, slot indices, item IDs, quantities, currency ItemStacks, Bronze-equivalent prices, and active multipliers. It does not record player IP addresses, chat messages, or server credentials.
