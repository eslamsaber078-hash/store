const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const db         = require('./database');
const path       = require('path');
const multer     = require('multer');
const fs         = require('fs');
const cloudinary = require('cloudinary').v2;
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const compression = require('compression');

// Load local .env file variables if present (does NOT override real env vars on Render)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
            const key = line.slice(0, eqIdx).trim();
            const val = line.slice(eqIdx + 1).trim();
            if (key && !process.env[key]) {   // never override Render env vars
                process.env[key] = val;
            }
        }
    });
    console.log('[ENV] Loaded .env from', envPath);
}

const app = express();
const PORT = process.env.PORT || 3000;
// Behind a reverse proxy (Render/nginx) set TRUST_PROXY=1 so req.ip and rate
// limiters see the real client IP instead of the proxy's.
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}
const crypto = require('crypto');
const SECRET_KEY = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
if (!process.env.JWT_SECRET) {
    console.warn('[SECURITY] JWT_SECRET not set in env — using a random per-boot secret (sessions will reset on restart). Set JWT_SECRET in your .env or Render env vars!');
}

// ─── Configure Cloudinary ─────────────────────────────────────────────────
// Supports two styles:
//   Style A (Render):  CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
//   Style B (manual):  CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
let cloudinaryReady = false;

if (process.env.CLOUDINARY_URL) {
    try {
        cloudinary.config({
            cloudinary_url: process.env.CLOUDINARY_URL,
            secure: true
        });
        cloudinaryReady = true;
        console.log(`[Cloudinary] Configured via CLOUDINARY_URL`);
    } catch (e) {
        try {
            const cUrl = process.env.CLOUDINARY_URL.replace('cloudinary://', 'http://');
            const parsed = new URL(cUrl);
            cloudinary.config({
                cloud_name: parsed.hostname,
                api_key:    parsed.username,
                api_secret: decodeURIComponent(parsed.password),
                secure:     true
            });
            cloudinaryReady = true;
            console.log(`[Cloudinary] Configured via CLOUDINARY_URL fallback — cloud: ${parsed.hostname}`);
        } catch (e2) {
            console.error('[Cloudinary] Failed to parse CLOUDINARY_URL:', e2.message);
        }
    }
} else if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure:     true
    });
    cloudinaryReady = true;
    console.log(`[Cloudinary] Configured via separate env vars — cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);
} else {
    console.warn('[Cloudinary] NO credentials found — images stored locally (ephemeral on Render!).');
    console.warn('[Cloudinary] Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to Render env vars.');
}

// ─── Upload helper ─────────────────────────────────────────────────────────
const uploadToCloudinary = (fileBuffer, mimetype) => {
    return new Promise((resolve, reject) => {
        const opts = { folder: 'davinci_products', resource_type: 'image' };
        const stream = cloudinary.uploader.upload_stream(opts, (error, result) => {
            if (error) {
                console.error('[Cloudinary] Upload failed:', JSON.stringify(error));
                return reject(error);
            }
            console.log('[Cloudinary] Uploaded OK:', result.secure_url);
            resolve(result.secure_url);
        });
        stream.end(fileBuffer);
    });
};

const uploadImage = async (file) => {
    if (cloudinaryReady) {
        return await uploadToCloudinary(file.buffer, file.mimetype);
    }
    // Local fallback (images lost on Render redeploy)
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const filename = 'img-' + suffix + safeExt;
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    return `/uploads/${filename}`;
};

// ─── Multer: memory storage, 10 MB limit, images only ──────────────────────
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('مسموح بملفات الصور فقط'));
    }
});

// ─── Security: Rate Limiters ───────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 5,                      // 5 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'عدد محاولات تسجيل الدخول تجاوز الحد المسموح. حاول مرة أخرى بعد 15 دقيقة.' },
    skipSuccessfulRequests: true // Don't count successful logins
});

// Review submission: max 5 per hour per IP
const reviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'لقد تجاوزت الحد المسموح لإضافة التعليقات. حاول مرة أخرى بعد ساعة.' }
});

// Register: max 3 accounts per hour per IP
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'تجاوزت الحد المسموح لإنشاء الحسابات.' }
});

// Orders: max 10 per 15 minutes per IP (prevents order-table flooding)
const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'لقد تجاوزت الحد المسموح لإرسال الطلبات. حاول مرة أخرى بعد قليل.' }
});

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(compression({
    threshold: 1024,   // compress responses larger than 1 KB
    level: 6           // balanced ratio between speed and size
}));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
// ─── CORS: restrict to known origins ─────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
// If no env var is set, allow all origins (dev mode). Set ALLOWED_ORIGINS in production.
app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
}));
app.use(express.json({ limit: '2mb' }));         // Limit JSON body size
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Static files — served BEFORE the anti-cache middleware so they can be cached.
// Only explicitly whitelisted paths are served; the project root must NOT be
// exposed (it contains backend/database.sqlite, source code, etc.)
// ETag + Last-Modified enabled by default: browsers revalidate with a cheap 304.
app.use('/assets', express.static(path.join(__dirname, '../assets'), { maxAge: '7d' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
// CSS/JS: always revalidate via ETag (304 = no body transfer), never serve stale code
app.use('/style.css', express.static(path.join(__dirname, '../style.css'), { maxAge: 0 }));
app.use('/admin.css', express.static(path.join(__dirname, '../admin.css'), { maxAge: 0 }));
app.use('/main.js', express.static(path.join(__dirname, '../main.js'), { maxAge: 0 }));
app.use('/admin.js', express.static(path.join(__dirname, '../admin.js'), { maxAge: 0 }));
app.use('/products.js', express.static(path.join(__dirname, '../products.js'), { maxAge: 0 }));

// ─── Global Anti-Cache Middleware ──────────────────────────────────────────
// HTML pages and API responses must never be cached by browsers/proxies,
// so store visitors always see fresh data and admin never sees stale content.
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// Explicit SEO Static Routes
app.get('/robots.txt', (req, res) => res.sendFile(path.resolve(__dirname, '../robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.resolve(__dirname, '../sitemap.xml')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.resolve(__dirname, '../favicon.svg')));
app.get('/favicon.svg', (req, res) => res.sendFile(path.resolve(__dirname, '../favicon.svg')));

app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '../index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.resolve(__dirname, '../index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.resolve(__dirname, '../admin.html')));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const parts = authHeader && authHeader.split(' ');
    const token = parts && parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
    if (token == null) return res.status(401).json({ error: "انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول" });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "غير مصرح لك بإجراء هذه العملية (صلاحيات الأدمن مطلوبة)" });
    }
};

// ======================== AUTH ROUTES ========================
// Login — protected by rate limiter
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }
    db.get("SELECT * FROM users WHERE username = ?", [username.trim()], (err, user) => {
        if (err || !user) {
            // Uniform error: don't reveal whether user exists
            return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // Google-created accounts have no password; never pass NULL to bcrypt (crashes the process)
        if (!user.password) {
            return res.status(400).json({ error: 'هذا الحساب مسجل عبر جوجل. يرجى تسجيل الدخول باستخدام جوجل.' });
        }

        if (bcrypt.compareSync(password, user.password)) {
            const expiresIn = user.role === 'admin' ? '10m' : '24h';
            const token = jwt.sign(
                { id: user.id, username: user.username, role: user.role },
                SECRET_KEY,
                { expiresIn }
            );
            res.json({ token, role: user.role });
        } else {
            res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    });
});

// Register User (disabled for admin panel — admin is seeded)
app.post('/api/auth/register', registerLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.trim().length < 3 || password.length < 6) {
        return res.status(400).json({ error: 'البيانات المدخلة غير صالحة' });
    }
    // Google accounts are keyed by email; blocking '@' prevents account squatting
    // (attacker registering victim@gmail.com before the victim's Google login).
    if (username.includes('@')) {
        return res.status(400).json({ error: 'اسم المستخدم يجب ألا يحتوي على @' });
    }
    const hash = bcrypt.hashSync(password, 12);  // bcrypt cost 12 (was 10)
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')", [username.trim(), hash], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'اسم المستخدم مسجل بالفعل' });
            }
            return res.status(500).json({ error: 'خطأ في الخادم' });
        }
        const token = jwt.sign({ id: this.lastID, username, role: 'user' }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, role: 'user', message: 'تم تسجيل الحساب بنجاح' });
    });
});

// Google Auth
app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    let email, name, picture;

    // Real Google Token Verification only — mock mode removed for security
    if (!idToken) {
        return res.status(400).json({ error: "رمز التحقق من جوجل مطلوب" });
    }
    try {
        const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (!googleRes.ok) {
            return res.status(400).json({ error: "فشل التحقق من رمز تسجيل الدخول الخاص بجوجل" });
        }
        const tokenInfo = await googleRes.json();

        // Critical: verify the token was issued by Google AND for OUR app,
        // otherwise an attacker can mint a token for any email with their own client.
        if (tokenInfo.iss !== 'accounts.google.com' && tokenInfo.iss !== 'https://accounts.google.com') {
            return res.status(400).json({ error: "فشل التحقق من رمز تسجيل الدخول الخاص بجوجل" });
        }
        if (tokenInfo.email_verified !== undefined && tokenInfo.email_verified !== true && tokenInfo.email_verified !== 'true') {
            return res.status(400).json({ error: "البريد الإلكتروني غير موثق لدى جوجل" });
        }
        if (process.env.GOOGLE_CLIENT_ID && tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
            console.warn('[Google Auth] Rejected token with mismatched audience:', tokenInfo.aud);
            return res.status(400).json({ error: "فشل التحقق من رمز تسجيل الدخول الخاص بجوجل" });
        }
        if (!process.env.GOOGLE_CLIENT_ID) {
            console.warn('[SECURITY] GOOGLE_CLIENT_ID not set — Google tokens for ANY Google app will be accepted. Set it to your frontend OAuth client ID!');
        }

        email = tokenInfo.email;
        name = tokenInfo.name;
        picture = tokenInfo.picture;
    } catch (err) {
        console.error('[Google Auth] Error:', err.message);
        return res.status(500).json({ error: "خطأ أثناء الاتصال بخوادم جوجل" });
    }

    if (!email) {
        return res.status(400).json({ error: "لم يتم العثور على البريد الإلكتروني في رمز التحقق" });
    }

    // Check if user exists
    db.get("SELECT * FROM users WHERE username = ?", [email], (err, user) => {
        if (err) { console.error('[DB] Google auth lookup:', err.message); return res.status(500).json({ error: 'خطأ في الخادم' }); }

        if (user) {
            // Update profile info if changed
            db.run("UPDATE users SET name = ?, picture = ? WHERE id = ?", [name, picture, user.id], (updErr) => {
                const token = jwt.sign(
                    { id: user.id, username: user.username, role: user.role, name, picture },
                    SECRET_KEY,
                    { expiresIn: '24h' }
                );
                res.json({ token, role: user.role, name, picture, email });
            });
        } else {
            // Register new user authenticated via Google
            db.run("INSERT INTO users (username, name, picture, role) VALUES (?, ?, ?, 'user')", [email, name, picture], function(insErr) {
                if (insErr) { console.error('[DB] Google auth insert:', insErr.message); return res.status(500).json({ error: 'خطأ في الخادم' }); }
                const token = jwt.sign(
                    { id: this.lastID, username: email, role: 'user', name, picture },
                    SECRET_KEY,
                    { expiresIn: '24h' }
                );
                res.json({ token, role: 'user', name, picture, email });
            });
        }
    });
});


// Update Admin Credentials
app.put('/api/auth/update', authenticateToken, isAdmin, (req, res) => {
    const { newUsername, newPassword, currentPassword } = req.body;
    if (!newUsername || newUsername.trim().length < 3) {
        return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
    }
    if (!currentPassword) {
        return res.status(400).json({ error: 'كلمة المرور الحالية مطلوبة لتأكيد التغيير' });
    }
    if (newPassword && newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    db.get("SELECT * FROM users WHERE id = ?", [req.user.id], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'الحساب غير موجود' });
        }
        if (!user.password || !bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }

        let query = "UPDATE users SET username = ? WHERE id = ?";
        let params = [newUsername.trim(), req.user.id];
        if (newPassword) {
            const hash = bcrypt.hashSync(newPassword, 10);
            query = "UPDATE users SET username = ?, password = ? WHERE id = ?";
            params = [newUsername.trim(), hash, req.user.id];
        }

        db.run(query, params, function(updErr) {
            if (updErr) {
                console.error('[DB] Update admin:', updErr.message);
                if (updErr.message && updErr.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'اسم المستخدم مسجل بالفعل' });
                }
                return res.status(500).json({ error: 'خطأ في الخادم' });
            }
            res.json({ message: "تم تحديث بيانات الدخول بنجاح" });
        });
    });
});

// ======================== PRODUCTS ROUTES ========================
// ─── In-memory TTL cache for hot public read endpoints ────────────────────
// Absorbs traffic spikes: DB is only hit once per TTL window per key.
// Admin write routes invalidate the relevant key immediately.
const readCache = new Map(); // key -> { value, expiresAt }

function cacheGet(key) {
    const entry = readCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > Date.now()) return entry.value;
    readCache.delete(key);
    return undefined;
}

function cacheSet(key, value, ttlMs) {
    readCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function cacheInvalidate(prefix) {
    for (const key of readCache.keys()) {
        if (key.startsWith(prefix)) readCache.delete(key);
    }
}

function parseJsonArray(value, fallback) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (e) {
        return fallback;
    }
}

app.get('/api/products', (req, res) => {
    const cached = cacheGet('products:list');
    if (cached !== undefined) return res.json(cached);

    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        
        // Parse JSON strings back to objects + normalise column names to camelCase for frontend
        const products = rows.map(r => {
            let images = [];
            try { images = JSON.parse(r.images || '[]'); } catch(e) { images = []; }
            if (images.length === 0 && r.image) images = [r.image];
            return {
                id:           r.id,
                name:         r.name         || '',
                category:     r.category     || '',
                categoryName: r.category_name || r.category || '',
                price:        r.price        || 0,
                oldPrice:     r.old_price    || null,
                rating:       r.rating       || 5,
                reviewsCount: r.reviews_count || 0,
                image:        r.image        || '',
                images:       images,
                description:  r.description  || '',
                sizes:        parseJsonArray(r.sizes, []),
                colors:       parseJsonArray(r.colors, []),
                inStock:      r.in_stock === 1 || r.in_stock === true || r.in_stock === 'true' || r.in_stock === null || r.in_stock === undefined,
                featured:     r.featured === 1 || r.featured === true || r.featured === 'true'
            };
        });
        cacheSet('products:list', products, 10 * 1000); // 10s TTL
        res.json(products);
    });
});

app.post('/api/products', authenticateToken, isAdmin, upload.array('imagesFiles', 10), async (req, res) => {
    const { name, category, categoryName, price, oldPrice, description, sizes, colors, inStock, featured } = req.body;

    if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "اسم المنتج مطلوب" });
    }
    const parsedPrice = parseFloat(price);
    if (!isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: "السعر يجب أن يكون رقماً صحيحاً" });
    }
    const parsedOldPrice = oldPrice ? parseFloat(oldPrice) : null;
    if (parsedOldPrice !== null && (!isFinite(parsedOldPrice) || parsedOldPrice < 0)) {
        return res.status(400).json({ error: "السعر القديم غير صالح" });
    }
    const sizesJson = JSON.stringify(parseJsonArray(sizes, []));
    const colorsJson = JSON.stringify(parseJsonArray(colors, []));
    
    let uploadedImages = [];
    try {
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file => uploadImage(file));
            uploadedImages = await Promise.all(uploadPromises);
        }
    } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        return res.status(500).json({ error: "فشل رفع الصور إلى السيرفر" });
    }
    
    let finalImages = [...uploadedImages];
    const mainImage = finalImages[0] || '';
    
    db.run(`INSERT INTO products 
        (name, category, category_name, price, old_price, rating, reviews_count, image, images, description, sizes, colors, in_stock, featured)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        String(name).trim(), 
        category, 
        categoryName, 
        parsedPrice, 
        parsedOldPrice, 
        5.0, 
        0, 
        mainImage, 
        JSON.stringify(finalImages), 
        description, 
        sizesJson,
        colorsJson,
        inStock === 'true' || inStock === true || inStock === undefined || inStock === null ? 1 : 0, 
        featured === 'true' || featured === true ? 1 : 0
    ], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        cacheInvalidate('products');
        res.json({ id: this.lastID, message: "Product added successfully" });
    });
});

app.put('/api/products/:id', authenticateToken, isAdmin, upload.array('imagesFiles', 10), async (req, res) => {
    const { name, category, categoryName, price, oldPrice, description, sizes, colors, inStock, featured, existingImages } = req.body;
    const productId = parseInt(req.params.id, 10);
    if (!Number.isInteger(productId)) {
        return res.status(400).json({ error: "معرّف المنتج غير صالح" });
    }

    if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "اسم المنتج مطلوب" });
    }
    const parsedPrice = parseFloat(price);
    if (!isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: "السعر يجب أن يكون رقماً صحيحاً" });
    }
    const parsedOldPrice = oldPrice ? parseFloat(oldPrice) : null;
    if (parsedOldPrice !== null && (!isFinite(parsedOldPrice) || parsedOldPrice < 0)) {
        return res.status(400).json({ error: "السعر القديم غير صالح" });
    }
    const sizesJson = JSON.stringify(parseJsonArray(sizes, []));
    const colorsJson = JSON.stringify(parseJsonArray(colors, []));
    
    let uploadedImages = [];
    try {
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file => uploadImage(file));
            uploadedImages = await Promise.all(uploadPromises);
        }
    } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        return res.status(500).json({ error: "فشل رفع الصور إلى السيرفر" });
    }
    
    let finalImages = [];
    if (existingImages) {
        try {
            finalImages = JSON.parse(existingImages);
            if (!Array.isArray(finalImages)) finalImages = [];
        } catch(e) {
            finalImages = existingImages ? existingImages.split(',').map(img => img.trim()).filter(Boolean) : [];
        }
    }
    finalImages = [...finalImages, ...uploadedImages];
    const mainImage = finalImages[0] || '';
    
    db.run(`UPDATE products SET 
        name = ?, category = ?, category_name = ?, price = ?, old_price = ?, image = ?, images = ?, description = ?, sizes = ?, colors = ?, in_stock = ?, featured = ?
        WHERE id = ?`, [
        String(name).trim(), 
        category, 
        categoryName, 
        parsedPrice, 
        parsedOldPrice, 
        mainImage, 
        JSON.stringify(finalImages), 
        description, 
        sizesJson,
        colorsJson,
        inStock === 'true' || inStock === true || inStock === undefined || inStock === null ? 1 : 0, 
        featured === 'true' || featured === true ? 1 : 0, 
        productId
    ], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        cacheInvalidate('products');
        res.json({ message: "Product updated successfully" });
    });
});

app.delete('/api/products/:id', authenticateToken, isAdmin, (req, res) => {
    const productId = parseInt(req.params.id, 10);
    if (!Number.isInteger(productId)) {
        return res.status(400).json({ error: "معرّف المنتج غير صالح" });
    }
    db.run("DELETE FROM products WHERE id = ?", [productId], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        cacheInvalidate('products');
        res.json({ message: "Product deleted" });
    });
});

// ======================== CATEGORIES ROUTES ========================
app.get('/api/categories', (req, res) => {
    const cached = cacheGet('categories:list');
    if (cached !== undefined) return res.json(cached);

    db.all("SELECT * FROM categories ORDER BY id ASC", [], (err, rows) => {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        cacheSet('categories:list', rows, 10 * 1000); // 10s TTL
        res.json(rows);
    });
});

app.post('/api/categories', authenticateToken, isAdmin, upload.single('categoryImageFile'), async (req, res) => {
    const body = req.body || {};
    const key = body.key;
    const name = body.name;
    const icon = body.icon;
    let image = body.image || '';

    if (!key || !name) {
        return res.status(400).json({ error: "اسم الفئة والمعرّف مطلوبان" });
    }

    try {
        if (req.file) {
            image = await uploadImage(req.file);
        }
    } catch (uploadError) {
        console.error("Category image upload error:", uploadError);
        return res.status(500).json({ error: "فشل رفع صورة الفئة" });
    }

    const cleanKey = String(key).trim().toLowerCase().replace(/\s+/g, '-');
    const defaultImg = `./assets/images/cat_${cleanKey}.jpg`;
    const finalImage = image || defaultImg;

    db.run(
        "INSERT INTO categories (key, name, icon, image) VALUES (?, ?, ?, ?)",
        [cleanKey, String(name).trim(), icon || 'fa-tag', finalImage],
        function(err) {
            if (err) {
                if (err.message && err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: "معرّف الفئة مسجل بالفعل" });
                }
                console.error('[DB]', err ? err.message : '');
                return res.status(500).json({ error: "خطأ في الخادم" });
            }
            cacheInvalidate('categories');
            res.json({ id: this.lastID, key: cleanKey, name, icon, image: finalImage, message: "Category created successfully" });
        }
    );
});

app.put('/api/categories/:id', authenticateToken, isAdmin, upload.single('categoryImageFile'), async (req, res) => {
    const categoryId = parseInt(req.params.id, 10);
    if (!Number.isInteger(categoryId)) {
        return res.status(400).json({ error: "معرّف الفئة غير صالح" });
    }
    const body = req.body || {};
    const name = body.name;
    const icon = body.icon;
    let image = body.image;

    if (!name) {
        return res.status(400).json({ error: "اسم الفئة مطلوب" });
    }

    try {
        if (req.file) {
            image = await uploadImage(req.file);
        }
    } catch (uploadError) {
        console.error("Category image upload error:", uploadError);
        return res.status(500).json({ error: "فشل رفع صورة الفئة" });
    }

    if (image !== undefined && image !== null && image !== '') {
        db.run(
            "UPDATE categories SET name = ?, icon = ?, image = ? WHERE id = ?",
            [String(name).trim(), icon || 'fa-tag', image, categoryId],
            function(err) {
                if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
                cacheInvalidate('categories');
                res.json({ message: "Category updated successfully" });
            }
        );
    } else {
        db.run(
            "UPDATE categories SET name = ?, icon = ? WHERE id = ?",
            [String(name).trim(), icon || 'fa-tag', categoryId],
            function(err) {
                if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
                cacheInvalidate('categories');
                res.json({ message: "Category updated successfully" });
            }
        );
    }
});

app.delete('/api/categories/:id', authenticateToken, isAdmin, (req, res) => {
    const categoryId = parseInt(req.params.id, 10);
    if (!Number.isInteger(categoryId)) {
        return res.status(400).json({ error: "معرّف الفئة غير صالح" });
    }
    db.run("DELETE FROM categories WHERE id = ?", [categoryId], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        cacheInvalidate('categories');
        res.json({ message: "Category deleted successfully" });
    });
});

// Upload Hero Slider Image
app.post('/api/upload-hero-image', authenticateToken, isAdmin, upload.single('heroImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "يرجى اختيار صورة أولاً" });
        }
        const imageUrl = await uploadImage(req.file);
        res.json({ imageUrl, message: "Image uploaded successfully" });
    } catch (err) {
        console.error("Hero upload error:", err);
        res.status(500).json({ error: "فشل رفع صورة الهيرو" });
    }
});

// ======================== SETTINGS ROUTES ========================
app.get('/api/settings', (req, res) => {
    const cached = cacheGet('settings:all');
    if (cached !== undefined) return res.json(cached);

    db.all('SELECT * FROM settings', [], (err, rows) => {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        cacheSet('settings:all', settings, 30 * 1000); // 30s TTL
        res.json(settings);
    });
});

app.put('/api/settings', authenticateToken, isAdmin, async (req, res) => {
    const allowed = [
        'bank_account', 'instapay', 'ewallets',
        'cash_on_delivery_enabled', 'reviews_enabled',
        'announcement_text', 'announcement_enabled',
        'theme_color', 'theme_mode', 'hero_slides', 'store_features'
    ];

    const upsert = (key, val) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT key FROM settings WHERE key = ?", [key], (err, row) => {
                if (err) return reject(err);
                if (row) {
                    db.run("UPDATE settings SET value = ? WHERE key = ?", [String(val), key], err2 => {
                        if (err2) reject(err2);
                        else resolve();
                    });
                } else {
                    db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, String(val)], err2 => {
                        if (err2) reject(err2);
                        else resolve();
                    });
                }
            });
        });
    };

    try {
        const updates = [];
        allowed.forEach(key => {
            if (req.body[key] !== undefined) updates.push(upsert(key, req.body[key]));
        });
        await Promise.all(updates);
        cacheInvalidate('settings');
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('[DB]', err.message); res.status(500).json({ error: "خطأ في الخادم" });
    }
});

// Helper function: relative time formatting in Arabic

function formatRelativeTimeArabic(dateString, dateTextFallback) {
    if (!dateString || dateString === 'CURRENT_DATETIME') {
        return (dateTextFallback && dateTextFallback !== 'الآن')
            ? dateTextFallback
            : 'الآن';
    }

    // PostgreSQL may return timestamp columns as a Date object.
    // Convert Date/String safely before parsing.
    let date;

    if (dateString instanceof Date) {
        date = dateString;
    } else {
        const value = String(dateString);

        const normalizedValue =
            value.includes('T') || value.includes('Z')
                ? value
                : value.replace(' ', 'T') + 'Z';

        date = new Date(normalizedValue);
    }

    if (isNaN(date.getTime())) {
        return (dateTextFallback && dateTextFallback !== 'الآن')
            ? dateTextFallback
            : 'الآن';
    }

    const now = new Date();
    const diffSeconds = Math.max(
        0,
        Math.floor((now.getTime() - date.getTime()) / 1000)
    );

    if (diffSeconds < 60) return 'الآن';

    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffMinutes < 60) {
        if (diffMinutes === 1) return 'منذ دقيقة';
        if (diffMinutes === 2) return 'منذ دقيقتين';
        if (diffMinutes >= 3 && diffMinutes <= 10) {
            return `منذ ${ diffMinutes } دقائق`;
        }
        return `منذ ${ diffMinutes } دقيقة`;
    }

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
        if (diffHours === 1) return 'منذ ساعة';
        if (diffHours === 2) return 'منذ ساعتين';
        if (diffHours >= 3 && diffHours <= 10) {
            return `منذ ${ diffHours } ساعات`;
        }
        return `منذ ${ diffHours } ساعة`;
    }

    const diffDays = Math.floor(diffHours / 24);

    if (diffDays < 7) {
        if (diffDays === 1) return 'منذ يوم';
        if (diffDays === 2) return 'منذ يومين';
        if (diffDays >= 3 && diffDays <= 10) {
            return `منذ ${ diffDays } أيام`;
        }
        return `منذ ${ diffDays } يوماً`;
    }

    const diffWeeks = Math.floor(diffDays / 7);

    if (diffWeeks < 4) {
        if (diffWeeks === 1) return 'منذ أسبوع';
        if (diffWeeks === 2) return 'منذ أسبوعين';
        return `منذ ${ diffWeeks } أسابيع`;
    }

    const diffMonths = Math.floor(diffDays / 30);

    if (diffMonths < 12) {
        if (diffMonths === 1) return 'منذ شهر';
        if (diffMonths === 2) return 'منذ شهرين';
        if (diffMonths >= 3 && diffMonths <= 10) {
            return `منذ ${ diffMonths } أشهر`;
        }
        return `منذ ${ diffMonths } شهراً`;
    }

    const diffYears = Math.floor(diffDays / 365);

    if (diffYears === 1) return 'منذ سنة';
    if (diffYears === 2) return 'منذ سنتين';

    return `منذ ${ diffYears } سنوات`;
}



// ======================== REVIEWS ROUTES ========================
app.get('/api/reviews', (req, res) => {
    const cached = cacheGet('reviews:list');
    if (cached !== undefined) return res.json(cached);

    db.get("SELECT value FROM settings WHERE key = 'reviews_enabled'", [], (err, setRow) => {
        const isEnabled = !setRow || setRow.value !== 'false';
        
        db.all("SELECT * FROM reviews WHERE status IS NULL OR status = '' OR status = 'approved' ORDER BY id DESC", [], (err2, rows) => {
            if (err2) return res.status(500).json({ error: err2.message });
            
            const totalCount = rows.length;
            let sumRating = 0;
            const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

            rows.forEach(r => {
                const rVal = Math.max(1, Math.min(5, Math.round(r.rating || 5)));
                counts[rVal] = (counts[rVal] || 0) + 1;
                sumRating += parseFloat(r.rating) || 5;
            });

            const avgRating = totalCount > 0 ? (sumRating / totalCount).toFixed(1) : '4.8';
            const percentages = {
                5: totalCount > 0 ? Math.round((counts[5] / totalCount) * 100) : 82,
                4: totalCount > 0 ? Math.round((counts[4] / totalCount) * 100) : 12,
                3: totalCount > 0 ? Math.round((counts[3] / totalCount) * 100) : 4,
                2: totalCount > 0 ? Math.round((counts[2] / totalCount) * 100) : 1,
                1: totalCount > 0 ? Math.round((counts[1] / totalCount) * 100) : 1
            };

            const payload = {
                enabled: isEnabled,
                reviews: rows.map(r => ({
                    id: r.id,
                    name: r.name,
                    rating: r.rating,
                    comment: r.comment,
                    dateText: formatRelativeTimeArabic(r.created_at, r.date_text),
                    verified: r.verified === 1 || r.verified === true || r.verified === 'true'
                })),
                stats: {
                    avgRating,
                    totalCount: 1420 + totalCount,
                    percentages
                }
            };
            cacheSet('reviews:list', payload, 15 * 1000); // 15s TTL
            res.json(payload);
        });
    });
});

app.post('/api/reviews', reviewLimiter, (req, res) => {
    const { name, rating, comment } = req.body;
    if (!name || !comment) {
        return res.status(400).json({ error: 'يرجى كتابة الاسم والتعليق' });
    }
    const rateVal = Math.max(1, Math.min(5, parseFloat(rating) || 5));
    const nowIso = new Date().toISOString();
    db.run(
        "INSERT INTO reviews (name, rating, comment, date_text, verified, status, created_at) VALUES (?, ?, ?, 'الآن', 1, 'approved', ?)",
        [name.trim(), rateVal, comment.trim(), nowIso],
        function(err) {
            if (err) { console.error('[DB] Insert review:', err.message); return res.status(500).json({ error: 'خطأ في الخادم' }); }
            cacheInvalidate('reviews');
            res.json({
                success: true,
                id: this.lastID,
                review: {
                    id: this.lastID,
                    name: name.trim(),
                    rating: rateVal,
                    comment: comment.trim(),
                    dateText: 'الآن',
                    verified: true
                },
                message: 'شكراً لك! تم إضافة رأيك وتجربتك بنجاح.'
            });
        }
    );
});

// Admin Reviews CRUD
app.get('/api/admin/reviews', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT * FROM reviews ORDER BY id DESC", [], (err, rows) => {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        res.json(rows.map(r => ({
            id: r.id,
            name: r.name,
            rating: r.rating,
            comment: r.comment,
            dateText: formatRelativeTimeArabic(r.created_at, r.date_text),
            verified: r.verified === 1 || r.verified === true || r.verified === 'true',
            status: r.status || 'approved'
        })));
    });
});

app.post('/api/admin/reviews', authenticateToken, isAdmin, (req, res) => {
    const { name, rating, comment, dateText, verified, status } = req.body;
    if (!name || !comment) {
        return res.status(400).json({ error: 'الاسم والتعليق مطلوبان' });
    }
    db.run(
        "INSERT INTO reviews (name, rating, comment, date_text, verified, status) VALUES (?, ?, ?, ?, ?, ?)",
        [name.trim(), parseFloat(rating) || 5, comment.trim(), dateText || 'الآن', verified ? 1 : 0, status || 'approved'],
        function(err) {
            if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
            cacheInvalidate('reviews');
            res.json({ success: true, id: this.lastID, message: 'تم إضافة التقييم بنجاح' });
        }
    );
});

app.put('/api/admin/reviews/:id', authenticateToken, isAdmin, (req, res) => {
    const reviewId = parseInt(req.params.id, 10);
    if (!Number.isInteger(reviewId)) {
        return res.status(400).json({ error: "معرّف التقييم غير صالح" });
    }
    const { name, rating, comment, dateText, verified, status } = req.body;
    const finalDateText = (dateText && dateText.trim()) ? dateText.trim() : 'الآن';
    const finalStatus = (status && status.trim()) ? status.trim() : 'approved';
    db.run(
        "UPDATE reviews SET name = ?, rating = ?, comment = ?, date_text = ?, verified = ?, status = ? WHERE id = ?",
        [name ? name.trim() : '', parseFloat(rating) || 5, comment ? comment.trim() : '', finalDateText, verified ? 1 : 0, finalStatus, reviewId],
        function(err) {
            if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
            cacheInvalidate('reviews');
            res.json({ success: true, message: 'تم تحديث التقييم بنجاح' });
        }
    );
});

app.delete('/api/admin/reviews/:id', authenticateToken, isAdmin, (req, res) => {
    const reviewId = parseInt(req.params.id, 10);
    if (!Number.isInteger(reviewId)) {
        return res.status(400).json({ error: "معرّف التقييم غير صالح" });
    }
    db.run("DELETE FROM reviews WHERE id = ?", [reviewId], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        cacheInvalidate('reviews');
        res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
    });
});

// ======================== ORDERS ROUTES ========================
// Valid promo codes — the server is the source of truth for pricing.
const VALID_PROMO_CODES = { DAVINCI10: 0.1, LUXE10: 0.1 };
const VALID_ORDER_STATUSES = ['pending', 'pending_payment_verification', 'completed', 'cancelled'];

app.post('/api/orders', orderLimiter, (req, res) => {
    const body = req.body || {};
    const { customer_name, phone, address, governorate, city, payment_method, items, promo_code, payment_sender, payment_reference } = body;

    if (!customer_name || !String(customer_name).trim()) {
        return res.status(400).json({ error: "اسم العميل مطلوب" });
    }
    if (!phone || !String(phone).trim()) {
        return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    }
    if (!address || !String(address).trim()) {
        return res.status(400).json({ error: "العنوان مطلوب" });
    }
    if (!payment_method || !String(payment_method).trim()) {
        return res.status(400).json({ error: "طريقة الدفع مطلوبة" });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "سلة الطلب فارغة" });
    }
    for (const item of items) {
        if (!item || typeof item !== 'object') {
            return res.status(400).json({ error: "بيانات المنتجات في الطلب غير صالحة" });
        }
        const qty = parseInt(item.quantity, 10);
        if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
            return res.status(400).json({ error: "كمية غير صالحة لأحد المنتجات" });
        }
    }

    // Server-side pricing: look up real prices from the DB, ignore client-sent totals.
    const productIds = items
        .map(i => parseInt(i.product_id, 10))
        .filter(id => Number.isInteger(id) && id > 0);

    db.all(
        productIds.length > 0
            ? `SELECT id, name, price FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`
            : "SELECT id, name, price FROM products WHERE 1 = 0",
        productIds,
        (err, productRows) => {
            if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }

            const priceById = {};
            productRows.forEach(p => { priceById[p.id] = p; });

            const validItems = [];
            for (const item of items) {
                const product = priceById[parseInt(item.product_id, 10)];
                if (!product) {
                    return res.status(400).json({ error: "أحد المنتجات في السلة غير موجود" });
                }
                validItems.push({
                    productId: product.id,
                    name: product.name || String(item.name || 'منتج'),
                    quantity: parseInt(item.quantity, 10),
                    price: Number(product.price) || 0,
                    size: String(item.size || 'N/A').slice(0, 50),
                    color: String(item.color || 'افتراضي').slice(0, 50)
                });
            }

            const subtotal = validItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
            let discountRate = 0;
            if (promo_code && VALID_PROMO_CODES[String(promo_code).toUpperCase()]) {
                discountRate = VALID_PROMO_CODES[String(promo_code).toUpperCase()];
            }
            const discount = Math.round(subtotal * discountRate);
            const total = Math.max(0, subtotal - discount);

            const initialStatus = payment_method === 'cod' ? 'pending' : 'pending_payment_verification';
            const orderNumber = 'VL-' + Math.floor(10000 + Math.random() * 90000);

            db.run(`INSERT INTO orders 
                (order_number, customer_name, phone, address, governorate, city, payment_method, subtotal, discount, total, status, payment_sender, payment_reference)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                [orderNumber, String(customer_name).trim(), String(phone).trim(), String(address).trim(), governorate || null, city || null, String(payment_method).trim(), subtotal, discount, total, initialStatus, payment_sender || null, payment_reference || null], 
                function(insErr) {
                    if (insErr) { console.error('[DB]', insErr.message); return res.status(500).json({ error: "خطأ في الخادم" }); }

                    const orderId = this.lastID;
                    const itemPromises = validItems.map(item => {
                        return new Promise((resolve, reject) => {
                            db.run(
                                "INSERT INTO order_items (order_id, product_name, quantity, price, size, color) VALUES (?, ?, ?, ?, ?, ?)",
                                [orderId, item.name, item.quantity, item.price, item.size, item.color],
                                (itemErr) => {
                                    if (itemErr) reject(itemErr);
                                    else resolve();
                                }
                            );
                        });
                    });

                    Promise.all(itemPromises)
                        .then(() => {
                            res.json({ orderNumber, message: "Order placed successfully" });
                        })
                        .catch(itemErr => {
                            console.error('[DB] Insert order items:', itemErr.message);
                            res.status(500).json({ error: "خطأ في حفظ تفاصيل الطلب" });
                        });
                }
            );
        }
    );
});

app.get('/api/orders', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT * FROM orders ORDER BY created_at DESC", [], (err, orders) => {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        
        db.all("SELECT * FROM order_items", [], (err, items) => {
            if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
            
            // Map items to their respective orders
            const ordersWithItems = orders.map(order => {
                return {
                    ...order,
                    items: items.filter(item => item.order_id === order.id)
                };
            });
            
            res.json(ordersWithItems);
        });
    });
});

app.put('/api/orders/:id/status', authenticateToken, isAdmin, (req, res) => {
    const orderId = parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: "معرّف الطلب غير صالح" });
    }
    const { status } = req.body;
    if (!VALID_ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: "حالة الطلب غير صالحة" });
    }
    db.run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        res.json({ message: "Order status updated successfully" });
    });
});

app.delete('/api/orders/:id', authenticateToken, isAdmin, (req, res) => {
    const orderId = parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: "معرّف الطلب غير صالح" });
    }
    db.run("DELETE FROM order_items WHERE order_id = ?", [orderId], function(err) {
        if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
        
        db.run("DELETE FROM orders WHERE id = ?", [orderId], function(err) {
            if (err) { console.error('[DB]', err.message); return res.status(500).json({ error: "خطأ في الخادم" }); }
            res.json({ message: "Order deleted successfully" });
        });
    });
});

// ─── API 404 (JSON, not HTML) ─────────────────────────────────────────────
app.use('/api', (req, res) => {
    res.status(404).json({ error: "المسار غير موجود" });
});

// ─── Global Error Handler ──────────────────────────────────────────────────
// Catches any unhandled errors thrown in route handlers
app.use((err, req, res, next) => {
    console.error('[SERVER] Unhandled error:', err.message || err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});
