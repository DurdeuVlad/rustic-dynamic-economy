# Staging Verification Guide: Phase 1 Core Event Hook

> **Status: DEPLOYED AND LOADING CLEANLY on staging as of 2026-09-14.** The event
> hook is confirmed registered and active via real server logs. Actual live
> trade-mutation behavior (does a real purchase change Sile's price) has **not**
> yet been confirmed by a real player - that's the one thing left in this guide
> that still needs a human.

---

## What happened getting here (read this before assuming the code "just works")

The first two deployment attempts failed, and both failures were things the
offline Node.js test suite (which passed cleanly, 15/15 tests) could not have
caught:

1. **Rhino syntax rejection.** KubeJS's JS engine (Rhino, not V8/Node) rejected
   both files outright with `SyntaxError: invalid object initializer` - they
   never loaded at all. Cause: ES2015 object-shorthand properties
   (`{ CurrencyConverter, COIN_TIERS }`) and 13 template-literal strings across
   both files, neither supported by this Rhino build. Confirmed by checking the
   already-working `farmer.js` reference script: it uses arrow functions freely
   but zero template literals and zero shorthand properties anywhere - that's
   this project's actual safe JS dialect. Fixed by converting everything to
   plain string concatenation and explicit `key: value` pairs.
2. **`global` assignment is sandboxed.** After fixing #1, the hook registered
   successfully but logged a non-fatal error: `'global' cannot be assigned to
   in client or server scripts`. Investigated rather than suppressed: the
   assignment was dead code in both environments anyway (KubeJS server_scripts
   share one top-level scope, so the bare `CurrencyConverter` identifier
   already works; the Node.js test file bridges `global` itself independently).
   Removed entirely.
3. **The scaffolding's pilot NPCs were fictional.** `'Master Blacksmith Durand'`
   and `'Garth the Provisioner'` don't exist on this server - deploying with
   those names would have registered the hook but never actually triggered on
   a real trade. Switched the pilot cohort to **`Sile`**, a real Trader-role
   NPC confirmed via the earlier CustomNPCs economy audit (blacksmith, matches
   the placeholder's theme).

All three are fixed, committed, and redeployed. The boot log after the third
deployment was fully clean - all three expected lines present, zero errors of
any kind:

```text
[RusticEconomy] Successfully loaded CustomNPCs and NeoForge Java classes.
[RusticEconomy] Successfully hooked RoleEvent$TraderEvent via NativeEvents.onEvent.
[RusticEconomy] Phase 1 Core Event Hook active. Pilot listening for trade events.
```

(Note: it registered via `NativeEvents.onEvent`, KubeJS's own binding - not the
`NeoForge.EVENT_BUS` fallback. Both paths are implemented; this server's KubeJS
build supports the first one directly.)

---

## 1. Current deployment state

Both files are live at:
- `/mnt/raid-storage/mc-staging/data/kubejs/server_scripts/currency_converter.js`
- `/mnt/raid-storage/mc-staging/data/kubejs/server_scripts/dynamic_economy_core.js`

No further deploy step needed unless the repo changes again. To redeploy after a
future change: copy both files over, `chown vlad:vlad`, then either restart the
container or run `/kubejs reload server_scripts` in-game/RCON as an operator.

---

## 2. What still needs a real player

### Target NPC
- **NPC Name:** `Sile` (the blacksmith, real NPC from the CustomNPCs audit).

### Test Step 1: Initial State Inspection
1. Approach `Sile` and right-click to open his trade dialog.
2. Note the item and current currency requirement in the slot being tested.
3. Have the required currency in inventory (`adys_decorations:bronze_coin`, etc).

### Test Step 2: Execute a Trade (+8 Bronze Delta)
1. Complete a trade.
2. Watch server console logs for:
   ```text
   [RusticEconomy] Intercepted trade on pilot NPC 'Sile' by player '<YourUsername>'.
   [RusticEconomy:Phase1] Slot 0 updated on 'Sile': Item=... | Price: 32 -> 40 Bronze (adys_decorations:bronze_coin x40, none)
   [RusticEconomy] Invariant verified: Traded item '...' preserved strictly.
   ```
3. Re-open the trade screen: price should now read 40 Bronze; the traded item
   itself must be completely unchanged (same item, same count).

### Test Step 3: Multi-Trade Denomination Transition
Repeat trades and confirm the price climbs by 8 Bronze each time, correctly
crossing into Brass at 64 (`Bronze x56` -> `Brass x1`), then compound
allocation above that (`Brass x1, Bronze x8` at 72).

### Test Step 4: Ceiling & Reset
Keep trading past 140 Bronze - the next trade should cycle back to 32 Bronze
base, logged with `[CEILING REACHED - CYCLED TO BASE]`.

### Test Step 5: Pilot Isolation Safety Check
Trade with any NPC that is NOT `Sile` or `TestTrader` - confirm **no** log line
appears and that NPC's trade slots are completely untouched.

---

## 3. Troubleshooting

| Symptom | Probable Cause | Remedy |
| :--- | :--- | :--- |
| No log output when trading with Sile | Name mismatch, or Sile's in-game display name differs from what's hardcoded | Confirm exact display name; if different, update `PHASE_1_CONFIG.pilotCohort` in `dynamic_economy_core.js` and redeploy |
| Price updates in log but not in client screen | Client container screen caching | Close and reopen the trade dialog - CustomNPCs re-fetches live server memory on open |
| Invariant failure or sold item missing | `role.set` received null or a modified item | Check `role.getSold(slotIndex)` returned a valid item; review the `Invariant verified` log line |

---

## 4. Clean Rollback

```bash
rm /mnt/raid-storage/mc-staging/data/kubejs/server_scripts/dynamic_economy_core.js
rm /mnt/raid-storage/mc-staging/data/kubejs/server_scripts/currency_converter.js
```
Then reload (`/kubejs reload server_scripts` or restart the container). Sile's
trade configuration reverts to whatever it was before Phase 1 last mutated it.
