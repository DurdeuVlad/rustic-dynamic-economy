# Staging Verification Guide: Phase 1 Core Event Hook

> **Context:** Phase 1 implements the event interception and in-memory live price mutation loop on NeoForge 1.21.1 / KubeJS.  
> **Hard Boundary Compliance:** Development and static review were conducted exclusively within the repository. The live staging server was **not** touched or modified during this work.

---

## 1. Prerequisites & Deployment to Staging

To deploy Phase 1 scripts to the staging server:

1. Copy the following two files into the staging server's KubeJS directory:
   - `server_scripts/currency_converter.js` &rarr; `/mnt/raid-storage/mc-staging/data/kubejs/server_scripts/currency_converter.js`
   - `server_scripts/dynamic_economy_core.js` &rarr; `/mnt/raid-storage/mc-staging/data/kubejs/server_scripts/dynamic_economy_core.js`
2. **Do NOT modify or delete** any existing scripts (`farmer.js`, `main.js`, etc.).
3. Execute the KubeJS server script reload command:
   - Via in-game chat (OP level 2+): `/kubejs reload server_scripts`
   - Via RCON / console: `kubejs reload server_scripts`

---

## 2. Expected Server Startup / Reload Log Output

Check the server logs (`latest.log` or console output) immediately after reloading. Look for the `[RusticEconomy]` prefix:

```text
[INFO] [RusticEconomy] Successfully loaded CustomNPCs and NeoForge Java classes.
[INFO] [RusticEconomy] Successfully hooked RoleEvent$TraderEvent via NeoForge.EVENT_BUS.
[INFO] [RusticEconomy] Phase 1 Core Event Hook active. Pilot listening for trade events.
```

If you see these three log lines, the event hook is live and registered on the NeoForge event bus.

---

## 3. Step-by-Step Test Procedure on Pilot NPC

### Target NPC
- **NPC Name:** `Master Blacksmith Durand` (or `Garth the Provisioner`, or any NPC named `TestTrader`).
- **Location:** Blacksmith workshop in the staging town.

### Test Step 1: Initial State Inspection
1. Approach `Master Blacksmith Durand` and right-click to open his trade dialog.
2. Note the item in Slot 0 (e.g., `minecraft:iron_ingot x1`) and its current currency requirement (e.g., `32 Bronze Coins`).
3. Ensure you have the required currency in your inventory (`adys_decorations:bronze_coin`).

### Test Step 2: Execute First Trade (+8 Bronze Delta)
1. Complete the trade in Slot 0.
2. Observe server console logs for the trade event and invariant check:
   ```text
   [INFO] [RusticEconomy] Intercepted trade on pilot NPC 'Master Blacksmith Durand' by player '<YourUsername>'.
   [INFO] [RusticEconomy:Phase1] Slot 0 updated on 'Master Blacksmith Durand': Item=minecraft:iron_ingot x1 | Price: 32 -> 40 Bronze (adys_decorations:bronze_coin x40, none)
   [INFO] [RusticEconomy] Invariant verified: Traded item 'minecraft:iron_ingot x1' preserved strictly.
   ```
3. Re-open the trade screen (or look at the container slot if still open):
   - **Verification 1:** The required currency has updated to **40 Bronze Coins**.
   - **Verification 2 (Invariant):** The sold item is still exactly 1 Iron Ingot (unscaled, uncorrupted).

### Test Step 3: Multi-Trade Denomination Transition Test
Execute additional trades to verify that coin tiers automatically decompose and transition:

| Trade # | Starting Price | Expected New Price | Expected Slot 1 | Expected Slot 2 | Verification Goal |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Trade 1** | 32 Bronze | 40 Bronze | Bronze x40 | None | Base delta increase (+8) |
| **Trade 2** | 40 Bronze | 48 Bronze | Bronze x48 | None | Cumulative step |
| **Trade 3** | 48 Bronze | 56 Bronze | Bronze x56 | None | Nearing 64 ceiling |
| **Trade 4** | 56 Bronze | **64 Bronze** | **Brass x1** | None | **Base-64 tier promotion** (Bronze &rarr; Brass) |
| **Trade 5** | 64 Bronze | **72 Bronze** | **Brass x1** | **Bronze x8** | **2-Slot compound allocation** |

Expected log on Trade 4:
```text
[INFO] [RusticEconomy:Phase1] Slot 0 updated on 'Master Blacksmith Durand': Item=minecraft:iron_ingot x1 | Price: 56 -> 64 Bronze (adys_decorations:brass_coin x1, none)
```

Expected log on Trade 5:
```text
[INFO] [RusticEconomy:Phase1] Slot 0 updated on 'Master Blacksmith Durand': Item=minecraft:iron_ingot x1 | Price: 64 -> 72 Bronze (adys_decorations:brass_coin x1, adys_decorations:bronze_coin x8)
```

### Test Step 4: Ceiling & Reset Cycle Test
1. Continue trading until the price exceeds **140 Bronze**.
2. On the next trade, the script will cycle back to the starting base price (32 Bronze):
   ```text
   [INFO] [RusticEconomy:Phase1] Slot 0 updated on 'Master Blacksmith Durand': Item=... | Price: 144 -> 32 Bronze (adys_decorations:bronze_coin x32, none) [CEILING REACHED - CYCLED TO BASE]
   ```
3. Verify that the shopkeeper screen reflects 32 Bronze coins again.

### Test Step 5: Pilot Isolation Safety Check
1. Locate any non-pilot NPC merchant (e.g. an archivist, apothecary, or generic villager whose name is NOT in the pilot cohort).
2. Complete a trade.
3. Check the server console:
   - Verify that **NO** price update log appears.
   - Verify that the non-pilot NPC's trade slots remain completely unmodified.

---

## 4. Troubleshooting & Diagnostic Reference

| Symptom | Probable Cause | Remedy |
| :--- | :--- | :--- |
| `Java.loadClass` throws `ClassNotFoundException` | Mod JAR name or package changed | Verify installed CustomNPCs JAR version in staging `mods/` directory. |
| No log output when trading with Durand | Name mismatch or trade event not firing | Confirm exact NPC display name matches `PHASE_1_CONFIG.pilotCohort`. If custom name used, set `PHASE_1_CONFIG.allowAnyTrader = true`. |
| Price updates in log but not in client screen | Client container screen caching | Close and reopen the NPC trade dialog. In CustomNPCs, opening the dialog fetches live server memory. |
| Invariant failure or sold item missing | `role.set` received null or modified item | Check that `role.getSold(slotIndex)` returned valid item; review log line `Invariant verified`. |

---

## 5. Clean Rollback Procedure

If any unexpected behavior occurs during staging verification:
1. Delete or rename the two files:
   ```bash
   rm /mnt/raid-storage/mc-staging/data/kubejs/server_scripts/dynamic_economy_core.js
   rm /mnt/raid-storage/mc-staging/data/kubejs/server_scripts/currency_converter.js
   ```
2. Reload KubeJS:
   ```bash
   # In-game / RCON
   /kubejs reload server_scripts
   ```
3. NPC trade configurations will revert to their pre-script states.
