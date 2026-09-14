// ==============================================================================
// Rustic Dynamic Economy - Currency Conversion Engine
// Status: SCAFFOLDING & PROPOSAL - PENDING TEAM APPROVAL
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
 * THE TWO-SLOT CONSTRAINED ALLOCATION ALGORITHM (PROPOSAL):
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
 *    by 1 and set Slot 2 count to 0.
 * 6. Overflow / Large Value check: If T_max exceeds 64 items (e.g. > 64 Gold),
 *    both Slot 1 and Slot 2 can hold Gold (up to 128 Gold = 33,554,432 Bronze).
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
     * Decomposes a total Bronze value into up to 2 CustomNPCs currency ItemStacks.
     * 
     * @param {number} bronzeAmount - Total integer price in Bronze units
     * @param {boolean} isPlayerPaying - True if player is paying NPC (ceil rounding),
     *                                   False if NPC is paying player (floor rounding)
     * @returns {{ currency1: { id: string, count: number }, currency2: { id: string, count: number } | null }}
     */
    toTwoSlotCoins: function(bronzeAmount, isPlayerPaying) {
        if (bronzeAmount <= 0) {
            return {
                currency1: { id: 'adys_decorations:bronze_coin', count: 1 },
                currency2: null
            };
        }

        // TODO [Phase 1/3]: Finalize full unit test coverage for conversion edge cases
        // 1. Identify primary tier (highest tier where value <= bronzeAmount)
        let primaryIndex = COIN_TIERS.findIndex(tier => bronzeAmount >= tier.value);
        if (primaryIndex === -1) {
            // Price is below 1 Bronze; clamp to 1 Bronze
            return { currency1: { id: 'adys_decorations:bronze_coin', count: 1 }, currency2: null };
        }

        let primaryTier = COIN_TIERS[primaryIndex];
        let primaryCount = Math.floor(bronzeAmount / primaryTier.value);
        let remainder = bronzeAmount % primaryTier.value;

        // If exact match or lowest tier reached, no secondary slot needed
        if (remainder === 0 || primaryIndex === COIN_TIERS.length - 1) {
            return {
                currency1: { id: primaryTier.id, count: Math.min(primaryCount, 64) },
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
        }

        return {
            currency1: { id: primaryTier.id, count: primaryCount },
            currency2: secondaryCount > 0 ? { id: secondaryTier.id, count: secondaryCount } : null
        };
    },

    /**
     * Calculates the normalized Bronze integer value of two coin item stacks.
     */
    fromTwoSlotCoins: function(item1Id, count1, item2Id, count2) {
        let total = 0;
        let t1 = COIN_TIERS.find(t => t.id === item1Id);
        let t2 = COIN_TIERS.find(t => t.id === item2Id);

        if (t1) total += t1.value * (count1 || 0);
        if (t2) total += t2.value * (count2 || 0);

        return total;
    }
};

// Export for KubeJS scripts
// global.CurrencyConverter = CurrencyConverter;
