
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    app: "Mining Inventory Management API",
    status: "running"
  });
});

// Melihat semua barang
app.get("/api/items", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT *,
        CASE
          WHEN quantity = 0 THEN 'OUT'
          WHEN quantity <= minimum_stock THEN 'LOW'
          ELSE 'OK'
        END AS stock_status
      FROM inventory_items
      ORDER BY name
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Menambahkan barang baru
app.post("/api/items", async (req, res, next) => {
  try {
    const {
      code, name, category, location,
      quantity, minimum_stock, unit
    } = req.body;

    if (
      typeof code !== "string" || !code.trim() ||
      typeof name !== "string" || !name.trim() ||
      typeof category !== "string" || !category.trim() ||
      typeof location !== "string" || !location.trim() ||
      typeof unit !== "string" || !unit.trim()
    ) {
      return res.status(400).json({
        error: "Lengkapi seluruh data barang."
      });
    }

    const qty = quantity ?? 0;
    const min = minimum_stock ?? 5;

    if (
      !Number.isSafeInteger(qty) || qty < 0 ||
      !Number.isSafeInteger(min) || min < 0
    ) {
      return res.status(400).json({
        error: "Stok dan batas minimum harus bilangan bulat nonnegatif."
      });
    }

    const result = await pool.query(
      `INSERT INTO inventory_items
       (code, name, category, location, quantity, minimum_stock, unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        code.trim().toUpperCase(), name.trim(),
        category.trim(), location.trim(), qty, min, unit.trim()
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Kode barang sudah digunakan."
      });
    }
    next(error);
  }
});

// Transaksi barang masuk atau keluar
app.post("/api/items/:id/transactions", async (req, res, next) => {
  const { type, quantity, notes } = req.body;

  if (
    !["IN", "OUT"].includes(type) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    (notes !== undefined && typeof notes !== "string")
  ) {
    return res.status(400).json({
      error: "Tipe transaksi atau jumlah tidak valid."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const found = await client.query(
      "SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );

    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Barang tidak ditemukan." });
    }

    const item = found.rows[0];
    const change = type === "IN" ? quantity : -quantity;
    const newQuantity = Number(item.quantity) + change;

    if (newQuantity < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Stok tidak mencukupi." });
    }

    const updated = await client.query(
      `UPDATE inventory_items
       SET quantity = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newQuantity, item.id]
    );

    const transaction = await client.query(
      `INSERT INTO stock_transactions
       (item_id, transaction_type, quantity, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [item.id, type, quantity, notes?.trim() || null]
    );

    await client.query("COMMIT");

    res.status(201).json({
      item: updated.rows[0],
      transaction: transaction.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

// Riwayat transaksi
app.get("/api/transactions", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT t.*, i.code, i.name
      FROM stock_transactions t
      JOIN inventory_items i ON i.id = t.item_id
      ORDER BY t.created_at DESC
      LIMIT 200
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(500).json({
    error: "Terjadi kesalahan pada server."
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API berjalan pada port ${PORT}`);
});
