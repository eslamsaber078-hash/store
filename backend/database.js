const { Pool } = require('pg');
const pg = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

// Global configuration: Parse bigints (like COUNT(*)) as standard JS numbers (not string)
pg.types.setTypeParser(20, function(val) {
    return parseInt(val, 10);
});

// Configure PostgreSQL connection pool using environment variables
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn("WARNING: DATABASE_URL environment variable is missing. PostgreSQL pool will try default settings.");
}

const pool = new Pool({
    connectionString: connectionString,
    // Enable SSL if not local (Render requirement)
    ssl: connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1') 
        ? { rejectUnauthorized: false } 
        : false
});

// Connect and initialize DB schema and seeding
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the PostgreSQL database:', err.message);
    } else {
        console.log('Connected to the PostgreSQL database.');
        release();
        // Initialize schema and seed data
        initDb();
    }
});

// Mock statement class for db.prepare compatibility
class Statement {
    constructor(dbInstance, query) {
        this.db = dbInstance;
        this.query = query;
        this.promises = [];
    }

    run(...args) {
        let params = [];
        let callback = null;

        if (args.length > 0) {
            // If last argument is a callback function, extract it
            if (typeof args[args.length - 1] === 'function') {
                callback = args.pop();
            }
            
            // Handle array argument vs positional arguments
            if (Array.isArray(args[0])) {
                params = args[0];
            } else {
                params = args;
            }
        }

        const p = new Promise((resolve, reject) => {
            this.db.run(this.query, params, function(err) {
                if (callback) callback.call(this, err);
                if (err) reject(err);
                else resolve();
            });
        });
        this.promises.push(p);
        return this;
    }

    finalize(callback) {
        Promise.all(this.promises)
            .then(() => {
                if (callback) callback(null);
            })
            .catch(err => {
                if (callback) callback(err);
            });
    }
}

// Compatibility layer object
const db = {
    pool,

    // Mock run method (SQLITE run returns changes and lastID via context)
    run(query, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        let rewrittenQuery = query
            .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
            .replace(/DATETIME/gi, 'TIMESTAMP')
            .replace(/BOOLEAN/gi, 'INTEGER'); // Map boolean to integer for 1/0 consistency

        // Replace ? placeholders with $1, $2, etc.
        let placeholderIndex = 1;
        rewrittenQuery = rewrittenQuery.replace(/\?/g, () => `$${placeholderIndex++}`);

        // Append RETURNING id for inserts if not present and not targeting settings table
        const isInsert = /^\s*insert\s+into/i.test(rewrittenQuery);
        const isSettings = /into\s+settings/i.test(rewrittenQuery);
        if (isInsert && !isSettings && !/returning/i.test(rewrittenQuery)) {
            rewrittenQuery += ' RETURNING id';
        }

        pool.query(rewrittenQuery, params || [], (err, result) => {
            const context = {
                lastID: null,
                changes: 0
            };

            if (err) {
                // Ignore "duplicate column" and "duplicate table" errors during standard alter/migrations
                if (err.code === '42701' || err.code === '42P07') {
                    if (callback) callback.call(context, null);
                    return;
                }

                // Rewrite unique constraint violation message to match SQLite's message structure
                if (err.code === '23505') {
                    err.message = "UNIQUE constraint failed: " + (err.detail || '');
                }

                if (callback) callback.call(context, err);
                return;
            }

            context.changes = result.rowCount;
            if (result.rows && result.rows.length > 0 && result.rows[0].id !== undefined) {
                context.lastID = result.rows[0].id;
            }

            if (callback) {
                callback.call(context, null);
            }
        });
    },

    // Mock get method (returns first row)
    get(query, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        let rewrittenQuery = query;
        let placeholderIndex = 1;
        rewrittenQuery = rewrittenQuery.replace(/\?/g, () => `$${placeholderIndex++}`);

        pool.query(rewrittenQuery, params || [], (err, result) => {
            if (err) {
                if (callback) callback(err, null);
                return;
            }
            const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
            if (callback) callback(null, row);
        });
    },

    // Mock all method (returns all rows)
    all(query, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        let rewrittenQuery = query;
        let placeholderIndex = 1;
        rewrittenQuery = rewrittenQuery.replace(/\?/g, () => `$${placeholderIndex++}`);

        pool.query(rewrittenQuery, params || [], (err, result) => {
            if (err) {
                if (callback) callback(err, null);
                return;
            }
            if (callback) callback(null, result.rows || []);
        });
    },

    // Mock prepare method
    prepare(query) {
        return new Statement(this, query);
    }
};

// Database Initialization and Seeding logic
function initDb() {
    // 1. Create Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        picture TEXT,
        role TEXT DEFAULT 'user'
    )`, (err) => {
        if (!err) {
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
        id SERIAL PRIMARY KEY,
        name TEXT,
        category TEXT,
        categoryName TEXT,
        price REAL,
        oldPrice REAL,
        rating REAL,
        reviewsCount INTEGER,
        image TEXT,
        images TEXT,
        description TEXT,
        sizes TEXT,
        colors TEXT,
        inStock INTEGER DEFAULT 1,
        featured INTEGER DEFAULT 0
    )`, (err) => {
        if (!err) {
            // Seed Products from existing products.js
            db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
                if (row && row.count === 0) {
                    try {
                        const productsData = require('../products.js');
                        const stmt = db.prepare(`INSERT INTO products 
                            (name, category, categoryName, price, oldPrice, rating, reviewsCount, image, description, sizes, colors, inStock, featured)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                            
                        productsData.forEach(p => {
                            stmt.run([
                                p.name, 
                                p.category, 
                                p.categoryName, 
                                p.price, 
                                p.oldPrice, 
                                p.rating, 
                                p.reviewsCount, 
                                p.image, 
                                p.description, 
                                JSON.stringify(p.sizes || []), 
                                JSON.stringify(p.colors || []), 
                                p.inStock ? 1 : 0, 
                                p.featured ? 1 : 0
                            ]);
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
        id SERIAL PRIMARY KEY,
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
        payment_sender TEXT,
        payment_reference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // 4. Create Order Items Table
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
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

module.exports = db;
