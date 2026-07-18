const { Pool } = require('pg');
const pg = require('pg');
const bcrypt = require('bcrypt');

// Global configuration: Parse bigints (like COUNT(*)) as standard JS numbers
pg.types.setTypeParser(20, function(val) {
    return parseInt(val, 10);
});

// Configure PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn("WARNING: DATABASE_URL environment variable is missing. PostgreSQL pool will try default settings.");
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
        ? { rejectUnauthorized: false }
        : false
});

// Connect and initialize DB schema
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to the PostgreSQL database:', err.message);
    } else {
        console.log('Connected to the PostgreSQL database.');
        release();
        initDb();
    }
});

// ─── Helper: convert ? placeholders to $1, $2... ───────────────────────────
function convertPlaceholders(query) {
    let index = 1;
    return query.replace(/\?/g, () => `$${index++}`);
}

// ─── Helper: rewrite SQLite DDL → PostgreSQL DDL ───────────────────────────
function rewriteDDL(query) {
    return query
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
        .replace(/DATETIME/gi, 'TIMESTAMP')
        .replace(/\bBOOLEAN\b/gi, 'INTEGER');
}

// ─── Statement class (db.prepare compatibility) ────────────────────────────
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
            if (typeof args[args.length - 1] === 'function') callback = args.pop();
            params = Array.isArray(args[0]) ? args[0] : args;
        }
        const p = new Promise((resolve, reject) => {
            this.db.run(this.query, params, function(err) {
                if (callback) callback.call(this, err);
                if (err) reject(err); else resolve();
            });
        });
        this.promises.push(p);
        return this;
    }

    finalize(callback) {
        Promise.all(this.promises)
            .then(() => { if (callback) callback(null); })
            .catch(err => { if (callback) callback(err); });
    }
}

// ─── Compatibility layer ───────────────────────────────────────────────────
const db = {
    pool,

    run(query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }

        let q = rewriteDDL(query);
        q = convertPlaceholders(q);

        // Auto-append RETURNING id for INSERTs (except settings which has no integer id)
        const isInsert   = /^\s*insert\s+into/i.test(q);
        const isSettings = /into\s+settings/i.test(q);
        if (isInsert && !isSettings && !/returning/i.test(q)) {
            q += ' RETURNING id';
        }

        pool.query(q, params || [], (err, result) => {
            const ctx = { lastID: null, changes: 0 };
            if (err) {
                // Silently ignore duplicate-column / duplicate-table during migrations
                if (err.code === '42701' || err.code === '42P07') {
                    if (callback) callback.call(ctx, null);
                    return;
                }
                // Map unique-constraint error to SQLite-compatible message
                if (err.code === '23505') {
                    err.message = 'UNIQUE constraint failed: ' + (err.detail || '');
                }
                if (callback) callback.call(ctx, err);
                return;
            }
            ctx.changes = result.rowCount;
            if (result.rows && result.rows.length > 0 && result.rows[0].id !== undefined) {
                ctx.lastID = result.rows[0].id;
            }
            if (callback) callback.call(ctx, null);
        });
    },

    get(query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        const q = convertPlaceholders(query);
        pool.query(q, params || [], (err, result) => {
            if (err) { if (callback) callback(err, null); return; }
            const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
            if (callback) callback(null, row);
        });
    },

    all(query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        const q = convertPlaceholders(query);
        pool.query(q, params || [], (err, result) => {
            if (err) { if (callback) callback(err, null); return; }
            if (callback) callback(null, result.rows || []);
        });
    },

    prepare(query) {
        return new Statement(this, query);
    }
};

// ─── Schema + Seed ─────────────────────────────────────────────────────────
function initDb() {
    // 1. users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        picture TEXT,
        role TEXT DEFAULT 'user'
    )`, (err) => {
        if (err) return;
        const adminUsername = 'eslam.bk';
        const adminPassword = '01190622530';
        db.get("SELECT id FROM users WHERE username = ?", [adminUsername], (err, row) => {
            if (row) return;
            const hash = bcrypt.hashSync(adminPassword, 10);
            db.run(
                "INSERT INTO users (username, password, name, role) VALUES (?, ?, 'Eslam Admin', 'admin')",
                [adminUsername, hash],
                (err) => { if (!err) console.log("Admin account seeded: eslam.bk"); }
            );
        });
    });

    // 2. products — all snake_case to avoid PostgreSQL case-folding issues
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        category TEXT,
        category_name TEXT,
        price REAL,
        old_price REAL,
        rating REAL,
        reviews_count INTEGER,
        image TEXT,
        images TEXT,
        description TEXT,
        sizes TEXT,
        colors TEXT,
        in_stock INTEGER DEFAULT 1,
        featured INTEGER DEFAULT 0
    )`, (err) => {
        if (err) return;
        
        // Ensure older DB instances created in previous sessions get the new snake_case columns if they don't exist
        db.run("ALTER TABLE products ADD COLUMN category_name TEXT", () => {});
        db.run("ALTER TABLE products ADD COLUMN old_price REAL", () => {});
        db.run("ALTER TABLE products ADD COLUMN reviews_count INTEGER", () => {});
        db.run("ALTER TABLE products ADD COLUMN in_stock INTEGER DEFAULT 1", () => {});
        db.run("ALTER TABLE products ADD COLUMN featured INTEGER DEFAULT 0", () => {});

        db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
            if (!row || row.count !== 0) return;
            try {
                const productsData = require('../products.js');
                const stmt = db.prepare(`INSERT INTO products
                    (name, category, category_name, price, old_price, rating, reviews_count,
                     image, description, sizes, colors, in_stock, featured)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                productsData.forEach(p => {
                    stmt.run([
                        p.name, p.category, p.categoryName,
                        p.price, p.oldPrice, p.rating, p.reviewsCount,
                        p.image, p.description,
                        JSON.stringify(p.sizes  || []),
                        JSON.stringify(p.colors || []),
                        p.inStock  ? 1 : 0,
                        p.featured ? 1 : 0
                    ]);
                });
                stmt.finalize();
                console.log("Seeded default products into database.");
            } catch (e) {
                console.log("Could not seed products:", e.message);
            }
        });
    });

    // 3. orders — already snake_case
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

    // 4. order_items — use REFERENCES without inline FOREIGN KEY keyword for clarity
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        product_name TEXT,
        quantity INTEGER,
        price REAL,
        size TEXT,
        color TEXT
    )`);

    // 5. settings
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`, (err) => {
        if (err) return;
        db.get("SELECT COUNT(*) as count FROM settings", [], (err, row) => {
            if (!row || row.count !== 0) return;
            const defaultSettings = [
                { key: 'bank_account',           value: 'EG12345678901234567890 (البنك الأهلي)' },
                { key: 'instapay',                value: 'eslam.bk@instapay' },
                { key: 'ewallets',                value: '01190622530 (فودافون كاش)' },
                { key: 'cash_on_delivery_enabled', value: 'true' }
            ];
            const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
            defaultSettings.forEach(s => stmt.run(s.key, s.value));
            stmt.finalize();
            console.log("Default payment settings seeded.");
        });
    });
}

module.exports = db;
