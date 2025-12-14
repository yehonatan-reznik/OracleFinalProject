const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Simulate Oracle Database Connection
const db = {
    log: (msg) => console.log(`[ORACLE DB] ${msg}`)
};

// POS API Endpoint
app.post('/api/sales', (req, res) => {
    const sale = req.body;
    console.log('\n--- Received POS Sale ---');
    console.log('Payload:', JSON.stringify(sale, null, 2));

    // Simulate SQL Insert
    db.log(`INSERT INTO SALES (transaction_id, branch_id, cashier_id, final_amount, timestamp) VALUES ('${sale.transaction_id}', ${sale.branch_id}, ${sale.cashier_id}, ${sale.final_amount}, '${sale.timestamp}');`);

    sale.items.forEach(item => {
        db.log(`INSERT INTO SALE_ITEMS (transaction_id, product_sku, quantity, unit_price) VALUES ('${sale.transaction_id}', '${item.product_sku}', ${item.quantity}, ${item.unit_price});`);
        db.log(`UPDATE INVENTORY SET quantity = quantity - ${item.quantity} WHERE product_sku = '${item.product_sku}' AND branch_id = ${sale.branch_id};`);
    });

    res.json({ message: 'Sale processed successfully', transactionId: sale.transaction_id });
});

// Warehouse API Endpoint
app.post('/api/inventory', (req, res) => {
    const stock = req.body;
    console.log('\n--- Received Warehouse Stock Update ---');
    console.log('Payload:', JSON.stringify(stock, null, 2));

    // Simulate SQL Update
    db.log(`UPDATE INVENTORY SET quantity = quantity + ${stock.quantity}, last_updated = CURRENT_TIMESTAMP WHERE product_sku = '${stock.product_sku}' AND branch_id = ${stock.branch_id};`);

    res.json({ message: 'Inventory updated successfully', ref: stock.product_sku });
    res.json({ message: 'Inventory updated successfully', ref: stock.product_sku });
});

// Product Check API Endpoint
app.get('/api/products/:sku', (req, res) => {
    const sku = req.params.sku;
    console.log(`\n--- Received Stock Check for ${sku} ---`);

    // Mock Database Lookup
    const mockDB = {
        'PRD-001': { product_name: 'Wireless Mouse', category: 'Accessories', stock: 24, unit_price: 29.00 },
        'PRD-002': { product_name: 'Mechanical Keyboard', category: 'Accessories', stock: 12, unit_price: 89.00 },
        'PRD-003': { product_name: 'USB-C Cable 1m', category: 'Cables', stock: 78, unit_price: 12.00 }
    };

    const product = mockDB[sku];
    if (product) {
        db.log(`SELECT * FROM PRODUCTS WHERE sku = '${sku}';`); // Simulate SQL
        res.json(product);
    } else {
        db.log(`SELECT * FROM PRODUCTS WHERE sku = '${sku}'; -- Not Found`);
        res.status(404).json({ error: 'Product not found' });
    }
});

// Returns API Endpoint
app.post('/api/returns', (req, res) => {
    const returnData = req.body;
    console.log('\n--- Received Return Request ---');
    console.log('Payload:', JSON.stringify(returnData, null, 2));

    // Simulate SQL Insert
    db.log(`INSERT INTO RETURNS (transaction_id, product_name, quantity, condition, timestamp) VALUES ('${returnData.transaction_id}', '${returnData.product_name}', ${returnData.quantity}, '${returnData.condition}', '${returnData.timestamp}');`);

    res.json({ message: 'Return processed successfully', returnId: `RET-${Math.floor(Math.random() * 10000)}` });
});

app.listen(port, () => {
    console.log(`Oracle VM API Server running at http://localhost:${port}`);
    console.log('Ready to receive POS and Warehouse data...');
});
