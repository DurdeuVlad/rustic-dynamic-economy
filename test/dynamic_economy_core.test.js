const assert = require('assert');
const { CurrencyConverter, COIN_TIERS } = require('../server_scripts/currency_converter.js');
global.CurrencyConverter = CurrencyConverter;
global.COIN_TIERS = COIN_TIERS;

const {
    handleTraderEvent,
    PHASE_1_CONFIG,
    resolveTradeSlotIndex,
    isTraderRole,
    isEligiblePilotNpc
} = require('../server_scripts/dynamic_economy_core.js');

console.log('--- Running dynamic_economy_core Unit Tests ---');

// Test 1: isEligiblePilotNpc
{
    assert.strictEqual(isEligiblePilotNpc({ getName: () => 'Lenghel' }), true);
    assert.strictEqual(isEligiblePilotNpc({ getName: () => 'TestTrader' }), true);
    assert.strictEqual(isEligiblePilotNpc({ getName: () => 'Random Villager John' }), false);
    console.log('✓ Test 1 Passed: Pilot NPC eligibility filtering');
}

// Test 2: resolveTradeSlotIndex
{
    let mockSlots = [
        { getName: () => 'minecraft:iron_ingot', getStackSize: () => 1 },
        { getName: () => 'minecraft:copper_ingot', getStackSize: () => 1 },
        { getName: () => 'minecraft:diamond', getStackSize: () => 1 }
    ];
    let mockRole = {
        getSold: (i) => mockSlots[i] || null
    };

    // From event.slot
    let slotA = resolveTradeSlotIndex(mockRole, mockSlots[1], { slot: 1 });
    assert.strictEqual(slotA, 1);

    // Without event.slot: scanning slots
    let slotB = resolveTradeSlotIndex(mockRole, { getName: () => 'minecraft:diamond', getStackSize: () => 1 }, {});
    assert.strictEqual(slotB, 2);

    console.log('✓ Test 2 Passed: Trade slot index resolution');
}

// Test 3: handleTraderEvent end-to-end simulation
{
    let setCalls = [];
    let mockSoldItem = {
        getName: () => 'minecraft:iron_ingot',
        getStackSize: () => 1,
        copy: () => mockSoldItem
    };

    let mockRole = {
        getSold: (i) => (i === 0 ? mockSoldItem : null),
        set: (slot, sold, c1, c2) => {
            setCalls.push({ slot, sold, c1, c2 });
        }
    };

    let mockNpc = {
        getName: () => 'Lenghel',
        getRole: () => mockRole,
        getWorld: () => ({
            createItem: (id, dmg, count) => ({ id, count, getName: () => id, getStackSize: () => count })
        })
    };

    let mockPlayer = {
        getName: () => 'Steve',
        getUUID: () => '00000000-0000-0000-0000-000000000001'
    };

    // Initial trade: currency1 is 32 Bronze coins
    let mockEvent = {
        npc: mockNpc,
        player: mockPlayer,
        sold: mockSoldItem,
        currency1: { getName: () => 'adys_decorations:bronze_coin', getStackSize: () => 32 },
        currency2: null,
        slot: 0
    };

    handleTraderEvent(mockEvent);

    assert.strictEqual(setCalls.length, 1, 'role.set must be called exactly once');
    let call = setCalls[0];
    assert.strictEqual(call.slot, 0);
    // Invariant check: sold item must be the exact same sold item
    assert.strictEqual(call.sold.getName(), 'minecraft:iron_ingot');
    assert.strictEqual(call.sold.getStackSize(), 1);

    // Hardcoded test delta is +8 Bronze. Initial was 32, so new price must be 40 Bronze!
    let newTotalBronze = CurrencyConverter.fromTwoSlotCoins(call.c1, call.c2);
    assert.strictEqual(newTotalBronze, 40, `Expected new price to be 40 Bronze, got ${newTotalBronze}`);
    console.log(`✓ Test 3 Passed: Live price mutated 32 -> 40 Bronze (+8 delta) and invariant preserved`);

    // Test price progression across multiple trades to test tier transition (64 Bronze = 1 Brass)
    // Next trade starts with 40
    mockEvent.currency1 = setCalls[setCalls.length - 1].c1;
    mockEvent.currency2 = setCalls[setCalls.length - 1].c2;
    handleTraderEvent(mockEvent); // 40 + 8 = 48 Bronze

    mockEvent.currency1 = setCalls[setCalls.length - 1].c1;
    mockEvent.currency2 = setCalls[setCalls.length - 1].c2;
    handleTraderEvent(mockEvent); // 48 + 8 = 56 Bronze

    mockEvent.currency1 = setCalls[setCalls.length - 1].c1;
    mockEvent.currency2 = setCalls[setCalls.length - 1].c2;
    handleTraderEvent(mockEvent); // 56 + 8 = 64 Bronze (Exact 1 Brass!)

    let lastCall = setCalls[setCalls.length - 1];
    let priceAt64 = CurrencyConverter.fromTwoSlotCoins(lastCall.c1, lastCall.c2);
    assert.strictEqual(priceAt64, 64);
    assert.strictEqual(lastCall.c1.getName(), 'adys_decorations:brass_coin');
    assert.strictEqual(lastCall.c1.getStackSize(), 1);
    assert.strictEqual(lastCall.c2, null);
    console.log(`✓ Test 4 Passed: Multi-trade progression seamlessly crossed into 1 Brass coin`);
}

// Test 5: Non-pilot NPC trade is ignored
{
    let nonPilotCalls = [];
    let nonPilotNpc = {
        getName: () => 'Random Farmer Bob',
        getRole: () => ({
            getSold: () => ({ getName: () => 'minecraft:wheat', getStackSize: () => 1 }),
            set: () => nonPilotCalls.push(1)
        })
    };
    handleTraderEvent({
        npc: nonPilotNpc,
        player: { getName: () => 'Steve' },
        sold: { getName: () => 'minecraft:wheat', getStackSize: () => 1 },
        currency1: { getName: () => 'adys_decorations:bronze_coin', getStackSize: () => 2 },
        slot: 0
    });
    assert.strictEqual(nonPilotCalls.length, 0, 'Non-pilot NPC must not have its role mutated in Phase 1');
    console.log('✓ Test 5 Passed: Non-pilot NPCs safely untouched');
}

console.log('All dynamic_economy_core unit tests passed successfully!');
