const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // 1. Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            name TEXT,
            picture TEXT,
            role TEXT DEFAULT 'user'
        )`, (err) => {
            if (!err) {
                // Add name and picture columns dynamically if users table exists but columns are missing
                db.run("ALTER TABLE users ADD COLUMN name TEXT", () => {});
                db.run("ALTER TABLE users ADD COLUMN picture TEXT", () => {});

                // Seed Admin
                const adminUsername = 'eslam.bk';
                const adminPassword = '01190622530';
                db.get("SELECT id FROM users WHERE username = ?", [adminUsername], (err, row) => {
                    if (!row) {
                        const hash = bcrypt.hashSync(adminPassword, 10);
                        db.run("INSERT INTO users (username, password, name, role) VALUES (?, ?, 'Eslam Admin', 'admin')", [adminUsername, hash], (err) => {
                            if (!err) console.log("Admin account seeded: eslam.bk");
                        });
                    }
                });
            }
        });

        // 2. Create Products Table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            category TEXT,
            categoryName TEXT,
            price REAL,
            oldPrice REAL,
            rating REAL,
            reviewsCount INTEGER,
            image TEXT,
            images TEXT, -- JSON array of image URLs
            description TEXT,
            sizes TEXT, -- JSON string
            colors TEXT, -- JSON string
            inStock BOOLEAN,
            featured BOOLEAN
        )`, (err) => {
            if (!err) {
                // Dynamically add images column to existing database if it doesn't exist
                db.run("ALTER TABLE products ADD COLUMN images TEXT", (err) => {
                    // Ignore if column already exists
                });
                // Seed Products from existing products.js
                db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
                    if (row && row.count === 0) {
                        try {
                            const productsData = require('../products.js');
                            const stmt = db.prepare(`INSERT INTO products 
                                (name, category, categoryName, price, oldPrice, rating, reviewsCount, image, description, sizes, colors, inStock, featured)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                                
                            productsData.forEach(p => {
                                stmt.run([p.name, p.category, p.categoryName, p.price, p.oldPrice, p.rating, p.reviewsCount, p.image, p.description, JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), p.inStock ? 1 : 0, p.featured ? 1 : 0]);
                            });
                            stmt.finalize();
                            console.log("Seeded default products into database.");
                        } catch (e) {
                            console.log("Could not seed products: ", e.message);
                        }
                    }
                });
            }
        });

        // 3. Create Orders Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT,
            customer_name TEXT,
            phone TEXT,
            address TEXT,
            governorate TEXT,
            city TEXT,
            payment_method TEXT,
            subtotal REAL,
            discount REAL,
            total REAL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) {
                db.run("ALTER TABLE orders ADD COLUMN payment_sender TEXT", () => {});
                db.run("ALTER TABLE orders ADD COLUMN payment_reference TEXT", () => {});
            }
        });

        // 4. Create Order Items Table
        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_name TEXT,
            quantity INTEGER,
            price REAL,
            size TEXT,
            color TEXT,
            FOREIGN KEY(order_id) REFERENCES orders(id)
        )`);

        // 5. Create Settings Table
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`, (err) => {
            if (!err) {
                // Seed default settings
                const defaultSettings = [
                    { key: 'bank_account', value: 'EG12345678901234567890 (البنك الأهلي)' },
                    { key: 'instapay', value: 'eslam.bk@instapay' },
                    { key: 'ewallets', value: '01190622530 (فودافون كاش)' },
                    { key: 'cash_on_delivery_enabled', value: 'true' }
                ];
                
                db.get("SELECT COUNT(*) as count FROM settings", [], (err, row) => {
                    if (row && row.count === 0) {
                        const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
                        defaultSettings.forEach(s => stmt.run(s.key, s.value));
                        stmt.finalize();
                        console.log("Default payment settings seeded.");
                    }
                });
            }
        });
    }
});

module.exports = db;
