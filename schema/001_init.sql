-- ==============================================================================
-- Schema: Rustic Dynamic Economy
-- Database: SQLite 3
-- Target Modpack: Rustic Craft 2 SMP (NeoForge 1.21.1)
-- Safety Invariant: Live server runtime / KubeJS process has exclusive write
--                   authority. External tools/agents may only execute READ-ONLY
--                   queries while the server process is alive.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. trade_events: Immutable ledger of all completed NPC trades (Source of Truth)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trade_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    npc_id TEXT NOT NULL,                                -- Unique identifier or persistent name of the NPC
    slot_index INTEGER NOT NULL,                         -- Trade slot index within CustomNPCs trader role (0..N)
    item_id TEXT NOT NULL,                               -- Resource item being bought or sold (e.g., 'minecraft:iron_ingot')
    item_count INTEGER NOT NULL,                         -- Quantity of item traded
    buyer_uuid TEXT NOT NULL,                            -- Minecraft player UUID executing the trade
    buyer_name TEXT NOT NULL,                            -- Player display name at time of trade
    trade_type TEXT NOT NULL CHECK(trade_type IN ('BUY', 'SELL')), 
                                                         -- BUY = player buying from NPC; SELL = player selling to NPC
    currency1_item TEXT NOT NULL,                        -- Item ID in CustomNPCs currency slot 1 (e.g., 'adys_decorations:silver_coin')
    currency1_count INTEGER NOT NULL,                    -- Item count in currency slot 1 (1..64)
    currency2_item TEXT,                                 -- Item ID in CustomNPCs currency slot 2 (or NULL)
    currency2_count INTEGER DEFAULT 0,                   -- Item count in currency slot 2 (0..64)
    total_bronze_value INTEGER NOT NULL,                 -- Canonical normalized price in Bronze-equivalent units
    multiplier_at_trade REAL NOT NULL,                   -- Dynamic price multiplier applied at trade execution
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP         -- Timestamp of completed trade
);

CREATE INDEX IF NOT EXISTS idx_trade_events_npc_item ON trade_events(npc_id, item_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_timestamp ON trade_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_trade_events_buyer ON trade_events(buyer_uuid);

-- ------------------------------------------------------------------------------
-- 2. item_demand: Dynamic pricing state and rolling buy/sell volumes per NPC item
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_demand (
    npc_id TEXT NOT NULL,                                -- Unique identifier of the NPC
    item_id TEXT NOT NULL,                               -- Resource item identifier
    base_price_bronze INTEGER NOT NULL,                  -- Baseline administrator-configured price in Bronze units
    current_multiplier REAL NOT NULL DEFAULT 1.0,        -- Live price multiplier bounded to [min_multiplier, max_multiplier]
    rolling_buy_count INTEGER NOT NULL DEFAULT 0,        -- Rolling count of items purchased by players (upward pressure)
    rolling_sell_count INTEGER NOT NULL DEFAULT 0,       -- Rolling count of items sold by players (downward pressure)
    last_trade_time DATETIME,                            -- Timestamp of the most recent trade for this item
    last_decay_time DATETIME,                            -- Timestamp when exponential/linear decay was last applied
    min_multiplier REAL NOT NULL DEFAULT 0.5,            -- Hard floor multiplier (default 0.5x, -50%)
    max_multiplier REAL NOT NULL DEFAULT 6.0,            -- Hard ceiling multiplier (default 6.0x, +500%)
    sensitivity REAL NOT NULL DEFAULT 0.05,              -- Multiplier impact per unit traded (step sensitivity)
    PRIMARY KEY (npc_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_item_demand_multiplier ON item_demand(current_multiplier);

-- ------------------------------------------------------------------------------
-- 3. active_slots: Active visible trade slot allocations across server restarts
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS active_slots (
    npc_id TEXT NOT NULL,                                -- Unique identifier of the NPC
    slot_index INTEGER NOT NULL,                         -- Visible CustomNPCs role slot index (0..17 typical)
    item_id TEXT NOT NULL,                               -- Item assigned to this slot from the NPC pool
    item_count INTEGER NOT NULL DEFAULT 1,               -- Stack size offered in slot
    is_wildcard INTEGER NOT NULL DEFAULT 0,              -- 1 if slot is a pure-random wildcard; 0 if demand-weighted
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,      -- Timestamp when this rotation was assigned
    PRIMARY KEY (npc_id, slot_index)
);
