const { Pool } = require('pg');
const pg = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Global configuration for PG: Parse bigints as numbers
pg.types.setTypeParser(20, function(val) {
    return parseInt(val, 10);
});

let activeDriver = null; // 'pg' or 'sqlite'
let pgPool = null;
let sqliteDb = null;

// ─── Statement Class for db.prepare Compatibility ─────────────────────────
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

// ─── Core db Interface ────────────────────────────────────────────────────
const db = {
    run(query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        params = params || [];

        if (activeDriver === 'sqlite') {
            let q = query.replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
                         .replace(/TIMESTAMP/gi, 'DATETIME');
            sqliteDb.run(q, params, function(err) {
                const ctx = { lastID: this ? this.lastID : null, changes: this ? this.changes : 0 };
                if (callback) callback.call(ctx, err);
            });
        } else if (activeDriver === 'pg') {
            let q = query.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
                         .replace(/DATETIME/gi, 'TIMESTAMP');
            let index = 1;
            q = q.replace(/\?/g, () => `$${index++}`);

            const isInsert = /^\s*insert\s+into/i.test(q);
            const isSettings = /into\s+settings/i.test(q);
            if (isInsert && !isSettings && !/returning/i.test(q)) {
                q += ' RETURNING id';
            }

            pgPool.query(q, params, (err, result) => {
                const ctx = { lastID: null, changes: 0 };
                if (err) {
                    if (err.code === '42701' || err.code === '42P07') {
                        if (callback) callback.call(ctx, null);
                        return;
                    }
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
        } else {
            if (callback) callback.call({ lastID: null, changes: 0 }, new Error("Database driver not initialized"));
        }
    },

    get(query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        params = params || [];

        if (activeDriver === 'sqlite') {
            sqliteDb.get(query, params, (err, row) => {
                if (callback) callback(err, row || null);
            });
        } else if (activeDriver === 'pg') {
            let index = 1;
            const q = query.replace(/\?/g, () => `$${index++}`);
            pgPool.query(q, params, (err, result) => {
                if (err) { if (callback) callback(err, null); return; }
                const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
                if (callback) callback(null, row);
            });
        } else {
            if (callback) callback(new Error("Database driver not initialized"), null);
        }
    },

    all(query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        params = params || [];

        if (activeDriver === 'sqlite') {
            sqliteDb.all(query, params, (err, rows) => {
                if (callback) callback(err, rows || []);
            });
        } else if (activeDriver === 'pg') {
            let index = 1;
            const q = query.replace(/\?/g, () => `$${index++}`);
            pgPool.query(q, params, (err, result) => {
                if (err) { if (callback) callback(err, null); return; }
                if (callback) callback(null, result.rows || []);
            });
        } else {
            if (callback) callback(new Error("Database driver not initialized"), []);
        }
    },

    prepare(query) {
        return new Statement(this, query);
    }
};

// ─── Initialization Logic ─────────────────────────────────────────────────
function initSqlite() {
    console.log("[DB] Using local SQLite database (database.sqlite)");
    try {
        const sqlite3 = require('sqlite3').verbose();
        activeDriver = 'sqlite';
        const dbPath = path.join(__dirname, 'database.sqlite');
        sqliteDb = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error("[DB] Failed to open local SQLite database:", err.message);
            } else {
                console.log("[DB] SQLite database connected successfully.");
                initDb();
            }
        });
    } catch(e) {
        console.error("[DB] sqlite3 native module load error:", e.message);
        console.error("[DB] No DATABASE_URL configured either — the server cannot serve data. Exiting.");
        process.exit(1);
    }
}

const connectionString = process.env.DATABASE_URL;

if (connectionString) {
    console.log("[DB] DATABASE_URL provided. Connecting to PostgreSQL...");
    // Render's free Postgres plan allows only 5 concurrent connections,
    // while pg's default is 10. PG_POOL_MAX lets you raise it on paid plans.
    const poolMax = parseInt(process.env.PG_POOL_MAX, 10) || 5;
    pgPool = new Pool({
        connectionString,
        max: poolMax,
        idleTimeoutMillis: 30000,      // recycle idle connections quickly
        connectionTimeoutMillis: 10000, // fail fast instead of hanging under load
        ssl: !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')
            ? { rejectUnauthorized: false }
            : false
    });
    console.log(`[DB] Pool size: ${poolMax} connections`);

    pgPool.connect((err, client, release) => {
        if (err) {
            console.warn("[DB] PostgreSQL connection failed:", err.message);
            initSqlite();
        } else {
            console.log("[DB] Connected to PostgreSQL successfully.");
            activeDriver = 'pg';
            release();
            initDb();
        }
    });
} else {
    // No DATABASE_URL set -> use local SQLite directly for local dev!
    initSqlite();
}

// ─── Schema + Seed ─────────────────────────────────────────────────────────
function initDb() {
    // 1. users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        picture TEXT,
        role TEXT DEFAULT 'user'
    )`, (err) => {
        if (err) return;
        db.run("ALTER TABLE users ADD COLUMN name TEXT", () => {});
        db.run("ALTER TABLE users ADD COLUMN picture TEXT", () => {});
        db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", () => {});

        const adminUsername = process.env.ADMIN_USERNAME || 'eslam.bk';
        const adminPassword = process.env.ADMIN_PASSWORD || '01190622530';
        if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
            console.warn('[SECURITY] ADMIN_USERNAME or ADMIN_PASSWORD not set in env — using default credentials. Change them in .env or Render env vars!');
        }
        db.get("SELECT id FROM users WHERE username = ?", [adminUsername], (err, row) => {
            if (row) return;
            const hash = bcrypt.hashSync(adminPassword, 10);
            db.run(
                "INSERT INTO users (username, password, name, role) VALUES (?, ?, 'Admin', 'admin')",
                [adminUsername, hash],
                (err) => { if (!err) console.log("[DB] Admin account seeded successfully."); }
            );
        });
    });

    // 2. products
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        db.run("ALTER TABLE products ADD COLUMN category_name TEXT", () => {});
        db.run("ALTER TABLE products ADD COLUMN old_price REAL", () => {});
        db.run("ALTER TABLE products ADD COLUMN reviews_count INTEGER", () => {});
        db.run("ALTER TABLE products ADD COLUMN in_stock INTEGER DEFAULT 1", () => {});
        db.run("ALTER TABLE products ADD COLUMN featured INTEGER DEFAULT 0", () => {});

        db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
            if (!row || row.count !== 0) return;
            const defaultProducts = [
                {
                    name: "حذاء ألترامكس الذهبي الفاخر",
                    category: "shoes",
                    category_name: "أحذية",
                    price: 4900,
                    old_price: 6200,
                    rating: 4.9,
                    reviews_count: 128,
                    image: "./assets/images/shoes_ultramax_gold.jpg",
                    images: JSON.stringify(["./assets/images/shoes_ultramax_gold.jpg"]),
                    description: "حذاء رياضي يجمع بين الفخامة والراحة المتناهية. يتميز بنعل أوسط مبطن بتقنية متطورة لامتصاص الصدمات وتفاصيل ذهبية تعكس الرقي.",
                    sizes: JSON.stringify([40, 41, 42, 43, 44, 45]),
                    colors: JSON.stringify([
                        { name: "أسود ذهبي", code: "#1a1a1a", secondary: "#D4AF37" },
                        { name: "أبيض ذهبي", code: "#ffffff", secondary: "#D4AF37" }
                    ]),
                    in_stock: 1,
                    featured: 1
                },
                {
                    name: "حذاء رويال جلدي كلاسيكي",
                    category: "shoes",
                    category_name: "أحذية",
                    price: 5800,
                    old_price: null,
                    rating: 4.8,
                    reviews_count: 84,
                    image: "./assets/images/shoes_royal_classic.jpg",
                    images: JSON.stringify(["./assets/images/shoes_royal_classic.jpg"]),
                    description: "حذاء رسمي مصنوع يدويًا من جلد العجل الطبيعي 100%. تصميم إيطالي كلاسيكي يضفي لمسة من الأناقة والجاذبية على إطلالتك الرسمية.",
                    sizes: JSON.stringify([39, 40, 41, 42, 43, 44]),
                    colors: JSON.stringify([
                        { name: "بني داكن", code: "#5C4033", secondary: "#5C4033" },
                        { name: "أسود ملكي", code: "#000000", secondary: "#000000" }
                    ]),
                    in_stock: 1,
                    featured: 1
                },
                {
                    name: "حذاء نيو-ستريت العصري",
                    category: "shoes",
                    category_name: "أحذية",
                    price: 3200,
                    old_price: 3800,
                    rating: 4.6,
                    reviews_count: 62,
                    image: "./assets/images/shoes_new_street.jpg",
                    images: JSON.stringify(["./assets/images/shoes_new_street.jpg"]),
                    description: "حذاء كاجوال بتصميم عصري جريء ومريح للمشي اليومي. يتميز بجزء علوي من نسيج يسمح بالتهوية ونعل مطاطي متين ومرن.",
                    sizes: JSON.stringify([40, 41, 42, 43, 44]),
                    colors: JSON.stringify([
                        { name: "رمادي بلمسات برتقالية", code: "#808080", secondary: "#FF5733" },
                        { name: "أزرق داكن", code: "#000080", secondary: "#ffffff" }
                    ]),
                    in_stock: 1,
                    featured: 0
                },
                {
                    name: "سترة جلدية 'ستيلث' الفخمة",
                    category: "clothing",
                    category_name: "ملابس",
                    price: 7900,
                    old_price: 9500,
                    rating: 5.0,
                    reviews_count: 45,
                    image: "./assets/images/cloth_stealth_leather.jpg",
                    images: JSON.stringify(["./assets/images/cloth_stealth_leather.jpg"]),
                    description: "جاكيت جلد طبيعي فاخر بتصميم عصري مميز وقصة مثالية. يمنحك الدفء والمظهر الجذاب والقوي في آن واحد.",
                    sizes: JSON.stringify(["S", "M", "L", "XL", "XXL"]),
                    colors: JSON.stringify([
                        { name: "أسود مطفي", code: "#1a1a1a", secondary: "#1a1a1a" },
                        { name: "بني عتيق", code: "#3d2314", secondary: "#3d2314" }
                    ]),
                    in_stock: 1,
                    featured: 1
                },
                {
                    name: "كنزة صوفية أوفرسايز بيج",
                    category: "clothing",
                    category_name: "ملابس",
                    price: 1850,
                    old_price: 2400,
                    rating: 4.7,
                    reviews_count: 92,
                    image: "./assets/images/cloth_oversize_beige.jpg",
                    images: JSON.stringify(["./assets/images/cloth_oversize_beige.jpg"]),
                    description: "كنزة صوفية بتصميم أوفرسايز مريح للغاية، مصنوعة من قطن مصري فاخر ومبطنة بطبقة ناعمة لتوفر دفئاً ممتازاً.",
                    sizes: JSON.stringify(["M", "L", "XL", "XXL"]),
                    colors: JSON.stringify([
                        { name: "بيج كريمي", code: "#f5ebe0", secondary: "#f5ebe0" },
                        { name: "أسود داكن", code: "#0a0a0a", secondary: "#0a0a0a" }
                    ]),
                    in_stock: 1,
                    featured: 1
                }
            ];
            const stmt = db.prepare(`INSERT INTO products 
                (name, category, category_name, price, old_price, rating, reviews_count, image, images, description, sizes, colors, in_stock, featured)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            defaultProducts.forEach(p => stmt.run(
                p.name, p.category, p.category_name, p.price, p.old_price, p.rating, p.reviews_count,
                p.image, p.images, p.description, p.sizes, p.colors, p.in_stock, p.featured
            ));
            stmt.finalize();
            console.log("[DB] Default products seeded into database.");
        });
    });

    // 3. orders
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
        payment_sender TEXT,
        payment_reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) return;
        db.run("ALTER TABLE orders ADD COLUMN subtotal REAL", () => {});
        db.run("ALTER TABLE orders ADD COLUMN discount REAL", () => {});
        db.run("ALTER TABLE orders ADD COLUMN payment_sender TEXT", () => {});
        db.run("ALTER TABLE orders ADD COLUMN payment_reference TEXT", () => {});
        db.run("ALTER TABLE orders ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", () => {});
    });

    // 4. order_items
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_name TEXT,
        quantity INTEGER,
        price REAL,
        size TEXT,
        color TEXT
    )`);

    // 5. categories
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        name TEXT,
        icon TEXT DEFAULT 'fa-tag',
        image TEXT
    )`, (err) => {
        if (err) return;
        db.run("ALTER TABLE categories ADD COLUMN image TEXT", () => {});
        db.get("SELECT COUNT(*) as count FROM categories", [], (err, row) => {
            if (!row || row.count !== 0) return;
            const defaultCats = [
                { key: 'clothing',    name: 'الملابس الإيطالية الراقية', icon: 'fa-shirt',       image: './assets/images/cat_clothing.jpg' },
                { key: 'shoes',       name: 'أفخم الأحذية المصنوعة يدوياً', icon: 'fa-shoe-prints',  image: './assets/images/cat_shoes.jpg' },
                { key: 'pants',       name: 'بناطيل وتصميمات عصرية',       icon: 'fa-user-ninja',   image: './assets/images/cat_pants.jpg' },
                { key: 'accessories', name: 'ساعات وإكسسوارات النخبة',   icon: 'fa-gem',          image: './assets/images/cat_accessories.jpg' }
            ];
            const stmt = db.prepare("INSERT INTO categories (key, name, icon, image) VALUES (?, ?, ?, ?)");
            defaultCats.forEach(c => stmt.run(c.key, c.name, c.icon, c.image));
            stmt.finalize();
            console.log("[DB] Default categories seeded.");
        });
    });

    // 6. settings
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`, (err) => {
        if (err) return;
        const defaultSettings = [
            { key: 'bank_account',             value: 'EG12345678901234567890 (البنك الأهلي)' },
            { key: 'instapay',                  value: 'eslam.bk@instapay' },
            { key: 'ewallets',                  value: '01190622530 (فودافون كاش)' },
            { key: 'cash_on_delivery_enabled',  value: 'true' },
            { key: 'reviews_enabled',           value: 'true' },
            { key: 'announcement_text',         value: '["🚚 شحن مجاني للطلبات أكثر من 3,000 ج.م", "🏷️ استخدم كود DAVINCI10 للحصول على خصم 10%"]' },
            { key: 'announcement_enabled',      value: 'true' },
            { key: 'theme_color',               value: '#D4AF37' },
            { key: 'theme_mode',                value: 'dark' },
            { key: 'hero_slides',               value: JSON.stringify([
                {
                    image: './assets/images/suit.png',
                    title: 'تشكيلة الخريف والشتاء الحصرية 2026',
                    subtitle: 'أناقة بلا حدود | DA VINCI STORE',
                    description: 'استمتع بأفخم التصميمات الحصرية والمنتجات المصنوعة يدوياً بأعلى معايير الجودة الإيطالية.'
                },
                {
                    image: './assets/images/shoes.jpg',
                    title: 'أفخم الأحذية المصنوعة يدوياً 2026',
                    subtitle: 'جلد طبيعي 100% | جودة وتصميم إيطالي',
                    description: 'مجموعة فاخرة ومريحة من أحذية الجلد الطبيعي المصنوعة بدقة عالية لتناسب ذوقك الرفيع.'
                }
            ]) },
            { key: 'store_features',            value: JSON.stringify([
                { icon: 'fa-truck-fast', title: 'شحن سريع ومجاني', desc: 'شحن خلال 24-48 ساعة لجميع المحافظات' },
                { icon: 'fa-rotate-left', title: 'استرجاع واستبدال مرن', desc: 'خلال 14 يوماً بكل سهولة وسلاسة' },
                { icon: 'fa-shield-halved', title: 'جودة مضمونة 100%', desc: 'منتجات أصلية من خامات طبيعية ممتازة' }
            ]) }
        ];

        defaultSettings.forEach(s => {
            db.get("SELECT key FROM settings WHERE key = ?", [s.key], (err, row) => {
                if (!err && !row) {
                    db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [s.key, s.value]);
                }
            });
        });
    });

    // 7. reviews
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        rating REAL DEFAULT 5,
        comment TEXT,
        date_text TEXT,
        verified INTEGER DEFAULT 1,
        status TEXT DEFAULT 'approved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) return;
        db.run("ALTER TABLE reviews ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", () => {});
        db.run("ALTER TABLE reviews ADD COLUMN date_text TEXT", () => {});
        db.run("ALTER TABLE reviews ADD COLUMN status TEXT DEFAULT 'approved'", () => {});
        db.run("ALTER TABLE reviews ADD COLUMN verified INTEGER DEFAULT 1", () => {});

        db.get("SELECT COUNT(*) as count FROM reviews", [], (err, row) => {
            if (!row || row.count !== 0) return;
            const defaultReviews = [
                {
                    name: 'أحمد عبد الرحمن',
                    rating: 5,
                    comment: 'الحذاء الترا بوست الذهبي فخم جداً ومريح في المشي بشكل لا يوصف، والتغليف راقي يليق بماركة فخمة. الشحن وصل في أقل من 24 ساعة للقاهرة. أنصح به بشدة.',
                    date_text: 'منذ يومين',
                    verified: 1,
                    status: 'approved'
                },
                {
                    name: 'خالد الشمري',
                    rating: 5,
                    comment: 'اشتريت السترة الجلدية \'ستيلث\' فخامة الجلد الطبيعي ممتازة والقصة مضبوطة تماماً. الموقع سهل التصفح وسريع جداً في الاستخدام، خيار العرض السريع وفر عليّ الكثير من الوقت.',
                    date_text: 'منذ أسبوع',
                    verified: 1,
                    status: 'approved'
                }
            ];
            const stmt = db.prepare("INSERT INTO reviews (name, rating, comment, date_text, verified, status) VALUES (?, ?, ?, ?, ?, ?)");
            defaultReviews.forEach(r => stmt.run(r.name, r.rating, r.comment, r.date_text, r.verified, r.status));
            stmt.finalize();
            console.log("[DB] Default reviews seeded.");
        });
    });
}

module.exports = db;
