
CREATE TABLE IF NOT EXISTS inventory_items (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(80) NOT NULL,
    location VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    minimum_stock INTEGER NOT NULL DEFAULT 5 CHECK (minimum_stock >= 0),
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL
        REFERENCES inventory_items(id),
    transaction_type VARCHAR(10) NOT NULL
        CHECK (transaction_type IN ('IN', 'OUT')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_item
ON stock_transactions(item_id);
