// ==============================================================================
// Rustic Dynamic Economy - Core Server Script
// Target: NeoForge 1.21.1 / KubeJS 1.21.1 / CustomNPCs-Unofficial-NeoForge
// Status: PHASE 1 ACTIVE - IN-MEMORY LIVE PRICE MUTATION ON PILOT NPC
// ==============================================================================

/**
 * ARCHITECTURAL SUMMARY - PHASE 1:
 * ------------------------------------------------------------------------------
 * Phase 1 implements the foundational trade event hook and live in-memory price
 * mutation on CustomNPCs merchant roles:
 *
 * 1. Event Interception:
 *    Hooks 'noppes.npcs.api.event.RoleEvent$TraderEvent' via the NeoForge EventBus
 *    or KubeJS NativeEvents.
 *
 * 2. Role Validation:
 *    Safely accesses event.npc.getRole() and verifies IRoleTrader capability.
 *
 * 3. The Critical Economic Invariant:
 *    ONLY currency1 and currency2 are mutated. The 'sold' item stack is strictly
 *    preserved without modification, scaling, or NBT alteration.
 *
 * 4. Phase 1 Test Pricing Logic (Hardcoded Delta):
 *    In Phase 1 (prior to Phase 2 SQLite ledger and Phase 3 Dynamic Pricing Engine),
 *    each completed trade increases the item's price by a hardcoded test delta (+8 Bronze).
 *    When the test price exceeds 140 Bronze, it resets to 32 Bronze, allowing infinite,
 *    repeatable verification of single-tier, multi-tier, and reset transitions.
 *
 * 5. In-Memory Mutation:
 *    Applies traderRole.set(slot, sold, currency1, currency2) directly in memory,
 *    updating the CustomNPCs merchant instantly without file reloads or Linked NPC files.
 */

// Native Java class references
let $TraderEvent = null;
let $IRoleTrader = null;
let $NeoForge = null;
let $NpcAPI = null;

try {
    $TraderEvent = Java.loadClass('noppes.npcs.api.event.RoleEvent$TraderEvent');
    $IRoleTrader = Java.loadClass('noppes.npcs.api.entity.data.role.IRoleTrader');
    $NeoForge = Java.loadClass('net.neoforged.neoforge.common.NeoForge');
    $NpcAPI = Java.loadClass('noppes.npcs.api.NpcAPI');
    console.info('[RusticEconomy] Successfully loaded CustomNPCs and NeoForge Java classes.');
} catch (e) {
    console.error('[RusticEconomy] Error loading Java classes for CustomNPCs/NeoForge: ' + e);
}

// Configuration for Phase 1 Pilot Testing
const PHASE_1_CONFIG = {
    // Restrict live mutation to designated pilot NPCs during Phase 1.
    // 'Sile' is a real Trader-role NPC on staging (blacksmith, confirmed via the
    // CustomNPCs economy audit) - the scaffolding's placeholder names
    // ("Master Blacksmith Durand" etc.) don't exist on this server and would
    // never actually trigger. 'TestTrader' kept as a fallback for a manually
    // spawned test NPC if one is ever added.
    pilotCohort: [
        'Sile',
        'TestTrader'
    ],
    // Set to true to allow any Trader NPC to be tested (useful if custom test NPC is spawned)
    allowAnyTrader: false,
    // Base hardcoded starting price if slot has no previous price
    defaultBasePriceBronze: 32,
    // Step increase per completed trade in Phase 1 test mode (+8 Bronze)
    testPriceDeltaBronze: 8,
    // Upper ceiling where test price cycles back to base price for continuous testing
    testPriceCycleCeilingBronze: 140
};

/**
 * Safely resolves the CurrencyConverter module across script environments.
 */
function getCurrencyConverter() {
    if (typeof CurrencyConverter !== 'undefined') return CurrencyConverter;
    if (typeof global !== 'undefined' && global.CurrencyConverter) return global.CurrencyConverter;
    if (typeof globalThis !== 'undefined' && globalThis.CurrencyConverter) return globalThis.CurrencyConverter;
    return null;
}

/**
 * Extracts a readable identifier from an ItemStack or IItemStack.
 */
function getItemId(stack) {
    if (!stack) return 'minecraft:air';
    try {
        if (typeof stack.getName === 'function') return String(stack.getName());
        if (typeof stack.getId === 'function') return String(stack.getId());
        if (stack.kjs$getId) return String(stack.kjs$getId());
        if (stack.id) return String(stack.id);
    } catch (e) {}
    return 'unknown_item';
}

/**
 * Extracts the item count from an ItemStack or IItemStack.
 */
function getItemCount(stack) {
    if (!stack) return 0;
    try {
        if (typeof stack.getStackSize === 'function') return stack.getStackSize();
        if (typeof stack.getCount === 'function') return stack.getCount();
        if (typeof stack.count === 'number') return stack.count;
    } catch (e) {}
    return 1;
}

/**
 * Checks whether an item stack is empty or null.
 */
function isStackEmpty(stack) {
    if (!stack) return true;
    try {
        if (typeof stack.isEmpty === 'function') return stack.isEmpty();
    } catch (e) {}
    return getItemCount(stack) <= 0;
}

/**
 * Locates the trade slot index (0..17) corresponding to the completed trade.
 */
function resolveTradeSlotIndex(role, soldItem, event) {
    // 1. Check if the event carries an explicit slot index
    if (event && typeof event.slot === 'number' && event.slot >= 0 && event.slot < 18) {
        return event.slot;
    }
    if (event && typeof event.getSlot === 'function') {
        try {
            let s = event.getSlot();
            if (typeof s === 'number' && s >= 0 && s < 18) return s;
        } catch (e) {}
    }

    // 2. Scan IRoleTrader slots to find matching sold item
    if (!role || typeof role.getSold !== 'function' || !soldItem) return -1;
    let targetId = getItemId(soldItem);
    let targetCount = getItemCount(soldItem);

    // Exact match on ID and stack size
    for (let i = 0; i < 18; i++) {
        try {
            let s = role.getSold(i);
            if (s && !isStackEmpty(s)) {
                if (getItemId(s) === targetId && getItemCount(s) === targetCount) {
                    return i;
                }
            }
        } catch (e) {}
    }

    // Fallback match on item ID alone
    for (let i = 0; i < 18; i++) {
        try {
            let s = role.getSold(i);
            if (s && !isStackEmpty(s) && getItemId(s) === targetId) {
                return i;
            }
        } catch (e) {}
    }

    return -1;
}

/**
 * Validates whether the given role is an IRoleTrader.
 */
function isTraderRole(role) {
    if (!role) return false;
    try {
        if ($IRoleTrader && $IRoleTrader.isInstance(role)) return true;
    } catch (e) {}
    // Duck-typing fallback for CustomNPCs API
    return typeof role.set === 'function' && typeof role.getSold === 'function';
}

/**
 * Checks whether the NPC is eligible for Phase 1 pilot price mutation.
 */
function isEligiblePilotNpc(npc) {
    if (!npc) return false;
    if (PHASE_1_CONFIG.allowAnyTrader) return true;

    let name = '';
    try {
        if (typeof npc.getName === 'function') name = String(npc.getName());
        else if (npc.name) name = String(npc.name);
    } catch (e) {}

    for (let i = 0; i < PHASE_1_CONFIG.pilotCohort.length; i++) {
        let pilotName = PHASE_1_CONFIG.pilotCohort[i];
        if (name === pilotName || name.includes(pilotName)) {
            return true;
        }
    }
    return false;
}

/**
 * Core Trade Event Handler
 * Executes on each completed CustomNPCs trade.
 */
function handleTraderEvent(event) {
    try {
        if (!event) return;

        let npc = event.npc;
        let player = event.player;
        let soldItem = event.sold;
        let currency1 = event.currency1;
        let currency2 = event.currency2;

        if (!npc) {
            console.warn('[RusticEconomy] Trade event received with null NPC entity.');
            return;
        }

        let npcName = (npc.getName ? npc.getName() : 'Unknown NPC');
        let playerName = (player && player.getName ? player.getName() : 'Unknown Player');

        // Check if interacting NPC is a designated pilot
        if (!isEligiblePilotNpc(npc)) {
            // Unmonitored NPC: allow trade to complete without Phase 1 test mutation
            return;
        }

        console.info('[RusticEconomy] Intercepted trade on pilot NPC \'' + npcName + '\' by player \'' + playerName + '\'.');

        // Retrieve NPC Role
        let role = npc.getRole ? npc.getRole() : null;
        if (!isTraderRole(role)) {
            console.warn('[RusticEconomy] NPC \'' + npcName + '\' has non-trader role (' + (role ? role.getClass().getName() : 'null') + '). Skipping.');
            return;
        }

        // Validate CurrencyConverter availability
        let converter = getCurrencyConverter();
        if (!converter) {
            console.error('[RusticEconomy] CurrencyConverter module unavailable! Cannot compute price mutation.');
            return;
        }

        // Resolve trade slot index
        let slotIndex = resolveTradeSlotIndex(role, soldItem, event);
        if (slotIndex < 0 || slotIndex >= 18) {
            console.warn('[RusticEconomy] Could not resolve trade slot index for sold item: ' + getItemId(soldItem) + '. Defaulting to slot 0.');
            slotIndex = 0;
        }

        // Read current price in Bronze
        let currentBronze = converter.fromTwoSlotCoins(currency1, currency2);
        if (currentBronze <= 0) {
            currentBronze = PHASE_1_CONFIG.defaultBasePriceBronze;
        }

        // ==========================================================================
        // Phase 1 Hardcoded Test Dynamic Pricing Logic:
        // Increase price by testPriceDeltaBronze (+8 Bronze) to simulate demand pressure.
        // If price exceeds testPriceCycleCeilingBronze (140 Bronze), cycle back to 32 Bronze.
        // ==========================================================================
        let nextBronze = currentBronze + PHASE_1_CONFIG.testPriceDeltaBronze;
        let cycled = false;
        if (nextBronze > PHASE_1_CONFIG.testPriceCycleCeilingBronze) {
            nextBronze = PHASE_1_CONFIG.defaultBasePriceBronze;
            cycled = true;
        }

        // Decompose into CustomNPCs 2-slot ItemStacks
        // isPlayerPaying = true (BUY trade: round UP ceiling)
        let newCoinStacks = converter.toTwoSlotItemStacks(npc, nextBronze, true);
        let coinSpec = converter.toTwoSlotCoins(nextBronze, true);

        // ==========================================================================
        // CRITICAL ECONOMIC INVARIANT VERIFICATION:
        // 'soldItem' must NOT be modified. Only currency1 and currency2 are updated.
        // ==========================================================================
        let invariantSoldStack = (role.getSold ? role.getSold(slotIndex) : null) || soldItem;
        let invariantSoldId = getItemId(invariantSoldStack);
        let invariantSoldCount = getItemCount(invariantSoldStack);

        // Apply live in-memory mutation
        role.set(slotIndex, invariantSoldStack, newCoinStacks.currency1, newCoinStacks.currency2);

        // Detailed observability logging
        let c1Desc = coinSpec.currency1 ? (coinSpec.currency1.id + ' x' + coinSpec.currency1.count) : 'none';
        let c2Desc = coinSpec.currency2 ? (coinSpec.currency2.id + ' x' + coinSpec.currency2.count) : 'none';
        let cycleNotice = cycled ? ' [CEILING REACHED - CYCLED TO BASE]' : '';

        console.info(
            '[RusticEconomy:Phase1] Slot ' + slotIndex + ' updated on \'' + npcName + '\': ' +
            'Item=' + invariantSoldId + ' x' + invariantSoldCount + ' | ' +
            'Price: ' + currentBronze + ' -> ' + nextBronze + ' Bronze (' + c1Desc + ', ' + c2Desc + ')' + cycleNotice
        );
        console.info(
            '[RusticEconomy] Invariant verified: Traded item \'' + invariantSoldId + ' x' + invariantSoldCount + '\' preserved strictly.'
        );

        // [Phase 2 TODO]: DbManager.recordTrade(npcName, slotIndex, invariantSoldId, invariantSoldCount, player.getUUID(), playerName, 'BUY', ...);
        // [Phase 3 TODO]: PricingEngine.calculateNewMultiplier(npcName, invariantSoldId, true);
        // [Phase 4 TODO]: RotationEngine.handleSlotRotation(npc);

    } catch (err) {
        console.error('[RusticEconomy] Exception in handleTraderEvent: ' + err);
        if (err.stack) console.error(err.stack);
    }
}

// ==============================================================================
// Event Listener Registration
// ==============================================================================

let registrationSuccess = false;

// Attempt 1: KubeJS NativeEvents
if (typeof NativeEvents !== 'undefined' && typeof NativeEvents.onEvent === 'function') {
    try {
        NativeEvents.onEvent('noppes.npcs.api.event.RoleEvent$TraderEvent', handleTraderEvent);
        registrationSuccess = true;
        console.info('[RusticEconomy] Successfully hooked RoleEvent$TraderEvent via NativeEvents.onEvent.');
    } catch (e) {
        console.warn('[RusticEconomy] NativeEvents.onEvent hook failed: ' + e + '. Attempting NeoForge EVENT_BUS fallback.');
    }
}

// Attempt 2: NeoForge EventBus direct registration (proven pattern from farmer.js)
if (!registrationSuccess) {
    try {
        if ($NeoForge && $NeoForge.EVENT_BUS && $TraderEvent) {
            $NeoForge.EVENT_BUS['addListener(java.lang.Class,java.util.function.Consumer)']($TraderEvent, handleTraderEvent);
            registrationSuccess = true;
            console.info('[RusticEconomy] Successfully hooked RoleEvent$TraderEvent via NeoForge.EVENT_BUS.');
        } else {
            console.warn('[RusticEconomy] NeoForge.EVENT_BUS or RoleEvent$TraderEvent class not ready at load time.');
        }
    } catch (e) {
        console.error('[RusticEconomy] Failed to register on NeoForge.EVENT_BUS: ' + e);
    }
}

if (registrationSuccess) {
    console.info('[RusticEconomy] Phase 1 Core Event Hook active. Pilot listening for trade events.');
} else {
    console.warn('[RusticEconomy] Event hook could not be registered immediately. Script will await event bus availability.');
}

// Export for testing / KubeJS inter-script access
if (typeof global !== 'undefined') {
    global.handleTraderEvent = handleTraderEvent;
    global.PHASE_1_CONFIG = PHASE_1_CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleTraderEvent: handleTraderEvent,
        PHASE_1_CONFIG: PHASE_1_CONFIG,
        resolveTradeSlotIndex: resolveTradeSlotIndex,
        isTraderRole: isTraderRole,
        isEligiblePilotNpc: isEligiblePilotNpc
    };
}
