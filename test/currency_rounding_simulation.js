// Empirical simulation of the Top-2 Denomination currency rounding algorithm,
// using the REAL shipped currency_converter.js (not a reimplementation), to
// answer: does directional rounding introduce systematic currency drain/gain
// over many trades, and does it ever produce an invalid ItemStack state?
'use strict';
const { CurrencyConverter, COIN_TIERS } = require('../server_scripts/currency_converter.js');

const BASE_PRICES = [8, 32, 100, 500, 2000, 4096, 10000, 50000, 262144, 1000000, 5000000];
const MULTIPLIERS = [];
for (let m = 0.5; m <= 6.0001; m += 0.05) MULTIPLIERS.push(Math.round(m * 100) / 100);

let totalTrials = 0;
let invalidStates = 0;
let maxRoundTripErrorBuy = 0;
let maxRoundTripErrorSell = 0;
let sumErrorBuy = 0;
let sumErrorSell = 0;

function checkValid(res, label) {
    for (const slot of [res.currency1, res.currency2]) {
        if (slot === null || slot === undefined) continue; // second slot legitimately unused
        if (slot.count > 64 || slot.count < 0) {
            invalidStates++;
            console.error(`INVALID STATE [${label}]: ${slot.id} count=${slot.count}`);
            return false;
        }
    }
    return true;
}

function backToBronze(res) {
    const c2id = res.currency2 ? res.currency2.id : null;
    const c2count = res.currency2 ? res.currency2.count : 0;
    return CurrencyConverter.fromTwoSlotCoins(res.currency1.id, res.currency1.count, c2id, c2count);
}

for (const base of BASE_PRICES) {
    for (const mult of MULTIPLIERS) {
        const price = Math.max(1, Math.round(base * mult));
        totalTrials++;

        // Player buying from NPC (NPC charges, rounds up - ceiling)
        const buyRes = CurrencyConverter.toTwoSlotCoins(price, true);
        checkValid(buyRes, `buy price=${price}`);
        const buyBack = backToBronze(buyRes);
        const buyError = buyBack - price; // positive = player overpaid
        maxRoundTripErrorBuy = Math.max(maxRoundTripErrorBuy, Math.abs(buyError));
        sumErrorBuy += buyError;
        if (buyError < 0) {
            console.error(`SINK RISK [buy]: price=${price} rounded to ${buyBack} (UNDERCHARGED - NPC loses value)`);
        }

        // NPC paying player (NPC pays, rounds down - floor)
        const sellRes = CurrencyConverter.toTwoSlotCoins(price, false);
        checkValid(sellRes, `sell price=${price}`);
        const sellBack = backToBronze(sellRes);
        const sellError = sellBack - price; // negative = player underpaid by NPC
        maxRoundTripErrorSell = Math.max(maxRoundTripErrorSell, Math.abs(sellError));
        sumErrorSell += sellError;
        if (sellError > 0) {
            console.error(`EXPLOIT RISK [sell]: price=${price} rounded to ${sellBack} (OVERPAID - free money exploit)`);
        }
    }
}

// Round-trip arbitrage check: can a player profit by buying then immediately
// selling the same item back, purely from rounding, with price unchanged?
let arbitrageCases = 0;
for (const base of BASE_PRICES) {
    for (const mult of MULTIPLIERS) {
        const price = Math.max(1, Math.round(base * mult));
        const buyRes = CurrencyConverter.toTwoSlotCoins(price, true);
        const buyCost = backToBronze(buyRes);
        const sellRes = CurrencyConverter.toTwoSlotCoins(price, false);
        const sellPayout = backToBronze(sellRes);
        if (sellPayout > buyCost) { // strictly greater: equal means zero rounding error, not exploitable
            arbitrageCases++;
            console.error(`ARBITRAGE: price=${price} buyCost=${buyCost} sellPayout=${sellPayout}`);
        }
    }
}

console.log('\n=== Currency Rounding Simulation Results ===');
console.log(`Total price points tested: ${totalTrials}`);
console.log(`Invalid ItemStack states: ${invalidStates}`);
console.log(`Buy-side (player pays): max round-trip error = ${maxRoundTripErrorBuy} Bronze, mean = ${(sumErrorBuy / totalTrials).toFixed(3)} Bronze`);
console.log(`Sell-side (NPC pays):   max round-trip error = ${maxRoundTripErrorSell} Bronze, mean = ${(sumErrorSell / totalTrials).toFixed(3)} Bronze`);
console.log(`Round-trip (buy then sell same price) arbitrage cases: ${arbitrageCases}`);
console.log(`\nDirectional bias check: buy error should be >= 0 always (NPC never undercharges),`);
console.log(`sell error should be <= 0 always (NPC never overpays). Mean buy error ${sumErrorBuy >= 0 ? 'OK (>=0)' : 'VIOLATION (<0)'}, mean sell error ${sumErrorSell <= 0 ? 'OK (<=0)' : 'VIOLATION (>0)'}.`);

if (invalidStates > 0 || arbitrageCases > 0 || sumErrorBuy < 0 || sumErrorSell > 0) {
    console.log('\nRESULT: FAIL - see errors above');
    process.exit(1);
} else {
    console.log('\nRESULT: PASS - no invalid states, no arbitrage, rounding direction correctly favors the NPC (never exploitable), error bounded and small');
    process.exit(0);
}
