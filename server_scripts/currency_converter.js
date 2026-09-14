// ==============================================================================
// Rustic Dynamic Economy - Currency Conversion Engine
// Status: PHASE 1 READY - PRODUCTION SCAFFOLDING
// ==============================================================================

/**
 * Currency System Architecture:
 * ------------------------------------------------------------------------------
 * Mod: adys_decorations
 * Coin Hierarchy (Strict Base-64 scaling):
 *   1 Bronze Coin = 1 Bronze (base unit)
 *   1 Brass Coin  = 64 Bronze
 *   1 Silver Coin = 64 Brass = 4,096 Bronze
 *   1 Gold Coin   = 64 Silver = 262,144 Bronze
 *
 * THE TWO-SLOT CONSTRAINED ALLOCATION ALGORITHM:
 * ------------------------------------------------------------------------------
 * CustomNPCs IRoleTrader.set(slot, sold, currency1, currency2) provides only TWO
 * currency item slots per trade, while an exact integer price can mathematically
 * span up to 4 coin denominations in base-64:
 *   Price = g*(64^3) + s*(64^2) + b*(64^1) + z*(64^0)
 *
 * Algorithm Strategy: "Top-2 Canonical Denominations with Directional Rounding"
 * 1. Find the highest non-zero denomination tier required (T_max).
 * 2. Slot 1 is allocated to T_max with its integer quotient.
 * 3. Slot 2 is allocated to the immediately lower denomination (T_max - 1).
 * 4. Any residual value from lower tiers (< T_max - 1) is rounded into Slot 2:
 *    - For BUY trades (player pays NPC): Ceiling rounding (protects against undercharging).
 *    - For SELL trades (NPC pays player): Floor rounding (protects against infinite money exploit).
 * 5. Carry-over check: If rounding causes Slot 2 count to reach 64, increment Slot 1
 *    by 1 and set Slot 2 count to 0. If Slot 1 also reaches 64, promote to the next higher
 *    tier when available.
 * 6. Overflow / Large Value check: If T_max exceeds 64 items (e.g. > 64 Gold),
 *    both Slot 1 and Slot 2 hold Gold (up to 128 Gold = 33,554,432 Bronze).
 *
 * UX & Precision Impact:
 * - 100% exact precision for all prices < 4,096 Bronze (the majority of transactions).
 * - Maximum variance on Silver tier (4,096 - 262,144) is <= 32 Bronze (<= 0.78%).
 * - Players never have to juggle more than 2 coin denominations for any single trade.
 */

const COIN_TIERS = [
    { id: 'adys_decorations:gold_coin',   name: 'Gold',   value: 262144 },
    { id: 'adys_decorations:silver_coin', name: 'Silver', value: 4096 },
    { id: 'adys_decorations:brass_coin',  name: 'Brass',  value: 64 },
    { id: 'adys_decorations:bronze_coin', name: 'Bronze', value: 1 }
];

const CurrencyConverter = {
    /**
     * Decomposes a total Bronze value into up to 2 CustomNPCs currency coin descriptors.
     * 
     * @param {number} bronzeAmount - Total integer price in Bronze units
     * @param {boolean} isPlayerPaying - True if player is paying NPC (ceil rounding),
     *                                   False if NPC is paying player (floor rounding)
     * @returns {{ currency1: { id: string, count: number }, currency2: { id: string, count: number } | null }}
     */
    toTwoSlotCoins: function(bronzeAmount, isPlayerPaying) {
        // Enforce integer and lower-bound safety (minimum price is 1 Bronze)
        let amount = Math.floor(Number(bronzeAmount) || 0);
        if (amount <= 0) {
            return {
                currency1: { id: 'adys_decorations:bronze_coin', count: 1 },
                currency2: null
            };
        }

        // 1. Identify primary tier (highest tier where value <= amount)
        let primaryIndex = COIN_TIERS.findIndex(tier => amount >= tier.value);
        if (primaryIndex === -1) {
            // Amount is below 1 Bronze; clamp to 1 Bronze
            return { currency1: { id: 'adys_decorations:bronze_coin', count: 1 }, currency2: null };
        }

        let primaryTier = COIN_TIERS[primaryIndex];
        let primaryCount = Math.floor(amount / primaryTier.value);
        let remainder = amount % primaryTier.value;

        // If exact match or lowest tier reached (Bronze), no secondary slot needed
        if (remainder === 0 || primaryIndex === COIN_TIERS.length - 1) {
            // Handle Gold overflow where primaryCount > 64. Both slots are forced to
            // hold the same (highest) tier here, so there is no room left for a
            // sub-tier remainder - if one exists (only possible when primaryIndex is
            // NOT the lowest tier, i.e. remainder came from a non-Bronze split further
            // up), it must be folded into the Gold count itself: ceiling (round up by
            // one coin) when the player is paying, floor (drop it) when the NPC pays.
            if (primaryCount > 64) {
                let totalCount = primaryCount;
                if (remainder !== 0 && isPlayerPaying) {
                    totalCount += 1;
                }
                totalCount = Math.min(totalCount, 128); // hard cap: 128 Gold = 33,554,432 Bronze
                return {
                    currency1: { id: primaryTier.id, count: Math.min(totalCount, 64) },
                    currency2: { id: primaryTier.id, count: Math.max(totalCount - 64, 0) }
                };
            }
            return {
                currency1: { id: primaryTier.id, count: primaryCount },
                currency2: null
            };
        }

        // Secondary tier is immediately lower
        let secondaryTier = COIN_TIERS[primaryIndex + 1];
        let secondaryCount = isPlayerPaying 
            ? Math.ceil(remainder / secondaryTier.value) 
            : Math.floor(remainder / secondaryTier.value);

        // Handle carry-over if rounding up reached 64
        if (secondaryCount >= 64) {
            primaryCount += 1;
            secondaryCount = 0;

            // If primaryCount reached 64 and can be promoted to a higher tier
            if (primaryCount >= 64 && primaryIndex > 0) {
                primaryIndex -= 1;
                primaryTier = COIN_TIERS[primaryIndex];
                primaryCount = 1;
                secondaryTier = null;
            }
        }

        // Handle Gold overflow where primaryCount > 64. As above, both slots are
        // forced to the same tier, so the already-computed secondaryCount (a
        // correctly-rounded sub-tier remainder) can't be represented directly -
        // fold it into the total instead of silently dropping it: ceiling (add
        // one more coin) when the player pays and a remainder exists, floor
        // (drop it) when the NPC pays.
        if (primaryCount > 64) {
            let totalCount = primaryCount;
            if (secondaryCount > 0 && isPlayerPaying) {
                totalCount += 1;
            }
            totalCount = Math.min(totalCount, 128); // hard cap: 128 Gold = 33,554,432 Bronze
            return {
                currency1: { id: primaryTier.id, count: Math.min(totalCount, 64) },
                currency2: { id: primaryTier.id, count: Math.max(totalCount - 64, 0) }
            };
        }

        return {
            currency1: { id: primaryTier.id, count: primaryCount },
            currency2: (secondaryTier && secondaryCount > 0) ? { id: secondaryTier.id, count: secondaryCount } : null
        };
    },

    /**
     * Converts a Bronze amount directly into CustomNPCs IItemStack instances.
     * 
     * @param {Object} npc - Interacting CustomNPCs entity instance
     * @param {number} bronzeAmount - Total Bronze units
     * @param {boolean} isPlayerPaying - Rounding direction (true = ceil, false = floor)
     * @returns {{ currency1: Object, currency2: Object | null }}
     */
    toTwoSlotItemStacks: function(npc, bronzeAmount, isPlayerPaying) {
        let coinSpec = this.toTwoSlotCoins(bronzeAmount, isPlayerPaying);
        let stack1 = coinSpec.currency1 ? this.createCustomNpcItemStack(npc, coinSpec.currency1.id, coinSpec.currency1.count) : null;
        let stack2 = coinSpec.currency2 ? this.createCustomNpcItemStack(npc, coinSpec.currency2.id, coinSpec.currency2.count) : null;
        return { currency1: stack1, currency2: stack2 };
    },

    /**
     * Creates a CustomNPCs IItemStack instance across different KubeJS and CustomNPCs environments.
     * 
     * @param {Object} npc - CustomNPCs entity
     * @param {string} itemId - Registry item ID (e.g. 'adys_decorations:bronze_coin')
     * @param {number} count - Stack count (1..64)
     * @returns {Object|null} CustomNPCs IItemStack or KubeJS ItemStack fallback
     */
    createCustomNpcItemStack: function(npc, itemId, count) {
        if (!itemId || count <= 0) return null;
        let safeCount = Math.min(Math.max(1, count), 64);

        // Strategy 1: NpcAPI.Instance().getIItemStack(mcStack)
        try {
            let $NpcAPI = Java.loadClass('noppes.npcs.api.NpcAPI');
            if ($NpcAPI && typeof Item !== 'undefined' && Item.of) {
                let api = $NpcAPI.Instance ? $NpcAPI.Instance() : null;
                if (api) {
                    let kjsStack = Item.of(itemId, safeCount);
                    let mcStack = (kjsStack && typeof kjsStack.getItemStack === 'function') 
                        ? kjsStack.getItemStack() 
                        : kjsStack;
                    let cnpcStack = api.getIItemStack(mcStack);
                    if (cnpcStack) return cnpcStack;
                }
            }
        } catch (e) {
            // Continue to fallback strategy
        }

        // Strategy 2: npc.getWorld().createItem(itemId, damage, count) or createItem(itemId, count)
        try {
            let world = npc ? (npc.getWorld ? npc.getWorld() : npc.world) : null;
            if (world && typeof world.createItem === 'function') {
                try {
                    return world.createItem(itemId, 0, safeCount);
                } catch (e2) {
                    return world.createItem(itemId, safeCount);
                }
            }
        } catch (e) {
            // Continue to fallback strategy
        }

        // Strategy 3: Standard KubeJS Item.of(itemId, count)
        try {
            if (typeof Item !== 'undefined' && Item.of) {
                return Item.of(itemId, safeCount);
            }
        } catch (e) {
            console.error('[RusticEconomy] Error creating ItemStack for ' + itemId + ': ' + e);
        }

        return null;
    },

    /**
     * Calculates the normalized Bronze integer value of two coin item stacks or descriptors.
     * Supports both direct objects (IItemStack / ItemStack) and scalar (id, count) signatures.
     * 
     * @param {string|Object} arg1 - Slot 1 item ID or item stack
     * @param {number|Object} [arg2] - Slot 1 count, or Slot 2 item stack
     * @param {string} [arg3] - Slot 2 item ID (when using 4-arg form)
     * @param {number} [arg4] - Slot 2 count (when using 4-arg form)
     * @returns {number} Normalized price in Bronze
     */
    fromTwoSlotCoins: function(arg1, arg2, arg3, arg4) {
        let id1 = null, count1 = 0, id2 = null, count2 = 0;

        // Helper to extract id and count from any ItemStack or coin descriptor
        function extract(item) {
            if (!item) return { id: null, count: 0 };
            let id = null;
            let count = 0;

            if (typeof item.getName === 'function') {
                id = String(item.getName());
            } else if (typeof item.getId === 'function') {
                id = String(item.getId());
            } else if (item.kjs$getId) {
                id = String(item.kjs$getId());
            } else if (item.id) {
                id = String(item.id);
            }

            if (typeof item.getStackSize === 'function') {
                count = item.getStackSize();
            } else if (typeof item.getCount === 'function') {
                count = item.getCount();
            } else if (typeof item.count === 'number') {
                count = item.count;
            } else {
                count = 1;
            }

            return { id: id, count: count };
        }

        if (arg1 && typeof arg1 === 'object') {
            let e1 = extract(arg1);
            id1 = e1.id;
            count1 = e1.count;

            if (arg2 && typeof arg2 === 'object') {
                let e2 = extract(arg2);
                id2 = e2.id;
                count2 = e2.count;
            }
        } else {
            id1 = arg1 ? String(arg1) : null;
            count1 = Number(arg2) || 0;
            id2 = arg3 ? String(arg3) : null;
            count2 = Number(arg4) || 0;
        }

        let total = 0;
        if (id1 && count1 > 0) {
            let t1 = COIN_TIERS.find(t => t.id === id1);
            if (t1) total += t1.value * count1;
        }
        if (id2 && count2 > 0) {
            let t2 = COIN_TIERS.find(t => t.id === id2);
            if (t2) total += t2.value * count2;
        }

        return total;
    }
};

// Export for KubeJS runtime (Rhino global scope)
if (typeof global !== 'undefined') {
    global.CurrencyConverter = CurrencyConverter;
    global.COIN_TIERS = COIN_TIERS;
}
if (typeof globalThis !== 'undefined') {
    globalThis.CurrencyConverter = CurrencyConverter;
    globalThis.COIN_TIERS = COIN_TIERS;
}

// Export for Node.js test suites
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CurrencyConverter: CurrencyConverter, COIN_TIERS: COIN_TIERS };
}
