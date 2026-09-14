const assert = require('assert');
const { CurrencyConverter, COIN_TIERS } = require('../server_scripts/currency_converter.js');

console.log('--- Running CurrencyConverter Unit Tests ---');

// Test 1: Zero / negative amounts clamp to 1 Bronze
{
    let resZero = CurrencyConverter.toTwoSlotCoins(0, true);
    assert.strictEqual(resZero.currency1.id, 'adys_decorations:bronze_coin');
    assert.strictEqual(resZero.currency1.count, 1);
    assert.strictEqual(resZero.currency2, null);

    let resNeg = CurrencyConverter.toTwoSlotCoins(-15, true);
    assert.strictEqual(resNeg.currency1.id, 'adys_decorations:bronze_coin');
    assert.strictEqual(resNeg.currency1.count, 1);
    assert.strictEqual(resNeg.currency2, null);
    console.log('✓ Test 1 Passed: Zero/Negative clamped to 1 Bronze');
}

// Test 2: Sub-64 Bronze exact values
{
    let res = CurrencyConverter.toTwoSlotCoins(32, true);
    assert.strictEqual(res.currency1.id, 'adys_decorations:bronze_coin');
    assert.strictEqual(res.currency1.count, 32);
    assert.strictEqual(res.currency2, null);
    console.log('✓ Test 2 Passed: Exact single-slot Bronze');
}

// Test 3: Brass + Bronze exact decomposition
{
    let res = CurrencyConverter.toTwoSlotCoins(100, true); // 1 Brass (64) + 36 Bronze (36)
    assert.strictEqual(res.currency1.id, 'adys_decorations:brass_coin');
    assert.strictEqual(res.currency1.count, 1);
    assert.strictEqual(res.currency2.id, 'adys_decorations:bronze_coin');
    assert.strictEqual(res.currency2.count, 36);

    let bronzeBack = CurrencyConverter.fromTwoSlotCoins(res.currency1.id, res.currency1.count, res.currency2.id, res.currency2.count);
    assert.strictEqual(bronzeBack, 100);
    console.log('✓ Test 3 Passed: Brass + Bronze decomposition matches exactly');
}

// Test 4: Directional rounding on Silver tier (Silver + Brass)
{
    // 1 Silver = 4096. Residual: 904. 904 / 64 = 14.125 Brass.
    // Buy trade (ceil): 14.125 -> 15 Brass
    let resBuy = CurrencyConverter.toTwoSlotCoins(5000, true);
    assert.strictEqual(resBuy.currency1.id, 'adys_decorations:silver_coin');
    assert.strictEqual(resBuy.currency1.count, 1);
    assert.strictEqual(resBuy.currency2.id, 'adys_decorations:brass_coin');
    assert.strictEqual(resBuy.currency2.count, 15);

    // Sell trade (floor): 14.125 -> 14 Brass
    let resSell = CurrencyConverter.toTwoSlotCoins(5000, false);
    assert.strictEqual(resSell.currency1.id, 'adys_decorations:silver_coin');
    assert.strictEqual(resSell.currency1.count, 1);
    assert.strictEqual(resSell.currency2.id, 'adys_decorations:brass_coin');
    assert.strictEqual(resSell.currency2.count, 14);
    console.log('✓ Test 4 Passed: Directional rounding (ceil vs floor) works as specified');
}

// Test 5: Carry-over when ceil reaches 64
{
    // 1 Silver + 63 Brass + 63 Bronze = 4096 + 4032 + 63 = 8191 Bronze.
    // Secondary tier is Brass (value 64). Remainder = 4095. 4095 / 64 = 63.984 -> ceil is 64!
    // Carry over: Slot 1 Silver count goes from 1 to 2, Slot 2 becomes null!
    let resCarry = CurrencyConverter.toTwoSlotCoins(8191, true);
    assert.strictEqual(resCarry.currency1.id, 'adys_decorations:silver_coin');
    assert.strictEqual(resCarry.currency1.count, 2);
    assert.strictEqual(resCarry.currency2, null);
    console.log('✓ Test 5 Passed: Carry-over secondary to primary works');
}

// Test 6: Promotion to higher tier when carry-over makes primary 64
{
    // 63 Brass + 63 Bronze = 4095.
    // For 4095, primary is Brass (index 2). Remainder is 63 Bronze.
    // In this case, secondary is Bronze (1). remainder/1 = 63 (integer, no rounding to 64).
    let res4095 = CurrencyConverter.toTwoSlotCoins(4095, true);
    assert.strictEqual(res4095.currency1.id, 'adys_decorations:brass_coin');
    assert.strictEqual(res4095.currency1.count, 63);
    assert.strictEqual(res4095.currency2.id, 'adys_decorations:bronze_coin');
    assert.strictEqual(res4095.currency2.count, 63);
    console.log('✓ Test 6 Passed: 4095 Bronze handled without illegal overflow');
}

// Test 7: Gold overflow (> 64 Gold up to 128 Gold)
{
    // 70 Gold = 70 * 262,144 = 18,350,080 Bronze
    let resGold = CurrencyConverter.toTwoSlotCoins(70 * 262144, true);
    assert.strictEqual(resGold.currency1.id, 'adys_decorations:gold_coin');
    assert.strictEqual(resGold.currency1.count, 64);
    assert.strictEqual(resGold.currency2.id, 'adys_decorations:gold_coin');
    assert.strictEqual(resGold.currency2.count, 6);
    console.log('✓ Test 7 Passed: Gold overflow split across both slots');
}

// Test 9 (regression, found by test/currency_rounding_simulation.js): Gold overflow
// WITH a non-zero sub-Gold remainder must round the remainder into the Gold count,
// never silently drop it. Price 17,250,000 Bronze = 65 Gold + 210,640 Bronze
// remainder (not evenly divisible). The old buggy code returned exactly 65 Gold,
// discarding the remainder entirely - undercharging the player by 210,640 Bronze.
{
    let resOverflowRemainder = CurrencyConverter.toTwoSlotCoins(17250000, true);
    assert.strictEqual(resOverflowRemainder.currency1.id, 'adys_decorations:gold_coin');
    assert.strictEqual(resOverflowRemainder.currency1.count, 64);
    assert.strictEqual(resOverflowRemainder.currency2.id, 'adys_decorations:gold_coin');
    assert.strictEqual(resOverflowRemainder.currency2.count, 2); // 66 total, rounded up from 65.8
    let backOverflow = CurrencyConverter.fromTwoSlotCoins(
        resOverflowRemainder.currency1.id, resOverflowRemainder.currency1.count,
        resOverflowRemainder.currency2.id, resOverflowRemainder.currency2.count
    );
    assert.ok(backOverflow >= 17250000, `Buy-side must never undercharge: got ${backOverflow}, price was 17250000`);
    console.log('✓ Test 9 Passed: Gold overflow with sub-Gold remainder rounds up instead of discarding value');
}

// Test 10: same overflow-with-remainder case, but NPC paying player (sell) - must
// floor/drop the remainder, never round up (never overpay).
{
    let resOverflowSell = CurrencyConverter.toTwoSlotCoins(17250000, false);
    let backOverflowSell = CurrencyConverter.fromTwoSlotCoins(
        resOverflowSell.currency1.id, resOverflowSell.currency1.count,
        resOverflowSell.currency2.id, resOverflowSell.currency2.count
    );
    assert.ok(backOverflowSell <= 17250000, `Sell-side must never overpay: got ${backOverflowSell}, price was 17250000`);
    console.log('✓ Test 10 Passed: Gold overflow with sub-Gold remainder floors correctly on sell side');
}

// Test 8: fromTwoSlotCoins with mock item objects
{
    let mockItem1 = { getName: () => 'adys_decorations:brass_coin', getStackSize: () => 2 };
    let mockItem2 = { getName: () => 'adys_decorations:bronze_coin', getStackSize: () => 5 };
    let val = CurrencyConverter.fromTwoSlotCoins(mockItem1, mockItem2);
    assert.strictEqual(val, 2 * 64 + 5);
    console.log('✓ Test 8 Passed: fromTwoSlotCoins with mock ItemStack objects');
}

console.log('All CurrencyConverter unit tests passed successfully!');
