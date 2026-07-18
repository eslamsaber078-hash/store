const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Load local .env file variables if present (zero-dependency helper)
if (fs.existsSync(path.join(__dirname, '.env'))) {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            process.env[key] = val;
        }
    });
}

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'davinci_store_secret_2026';

// Configure Cloudinary
cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

// Helper function to stream upload image file buffer to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'davinci_products' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        );
        uploadStream.end(fileBuffer);
    });
};

// Hybrid image upload: falls back to local uploads/ directory if CLOUDINARY_URL is missing
const uploadImage = async (file) => {
    if (process.env.CLOUDINARY_URL) {
        return await uploadToCloudinary(file.buffer);
    } else {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
        const localPath = path.join(__dirname, 'uploads', filename);
        
        if (!fs.existsSync(path.dirname(localPath))) {
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
        }
        
        fs.writeFileSync(localPath, file.buffer);
        return `/uploads/${filename}`;
    }
};

// Multer Memory Storage Configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use('/assets/images', express.static(path.join(__dirname, '../assets/images')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // For future uploaded images
app.use(express.static(path.join(__dirname, '../'))); // Serve static files from the parent directory (frontend)

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Forbidden" });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Requires Admin Privileges" });
    }
};

// ======================== AUTH ROUTES ========================
// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) return res.status(400).json({ error: "Invalid username or password" });

        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token, role: user.role });
        } else {
            res.status(400).json({ error: "Invalid username or password" });
        }
    });
});

// Register User
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')", [username, hash], function(err) {
        if (err) {
            if (err.message.includes("UNIQUE constraint failed")) {
                return res.status(400).json({ error: "اسم المستخدم مسجل بالفعل" });
            }
            return res.status(500).json({ error: err.message });
        }

        const token = jwt.sign({ id: this.lastID, username, role: 'user' }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, role: 'user', message: "تم تسجيل الحساب بنجاح" });
    });
});

// Google Auth
app.post('/api/auth/google', async (req, res) => {
    const { idToken, isMock, mockData } = req.body;
    let email, name, picture;

    if (isMock) {
        // Mock Auth for testing/fallback
        email = mockData?.email || 'eslam.customer@gmail.com';
        name = mockData?.name || 'عميل تجريبي جوجل';
        picture = mockData?.picture || '';
    } else {
        // Real Google Token Verification
        try {
            const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
            if (!googleRes.ok) {
                return res.status(400).json({ error: "فشل التحقق من رمز تسجيل الدخول الخاص بجوجل" });
            }
            const tokenInfo = await googleRes.json();
            email = tokenInfo.email;
            name = tokenInfo.name;
            picture = tokenInfo.picture;
        } catch (err) {
            return res.status(500).json({ error: "خطأ أثناء الاتصال بخوادم جوجل" });
        }
    }

    if (!email) {
        return res.status(400).json({ error: "لم يتم العثور على البريد الإلكتروني في رمز التحقق" });
    }

    // Check if user exists
    db.get("SELECT * FROM users WHERE username = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

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
                if (insErr) return res.status(500).json({ error: insErr.message });
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
    const { newUsername, newPassword } = req.body;
    let query = "UPDATE users SET username = ? WHERE id = ?";
    let params = [newUsername, req.user.id];

    if (newPassword) {
        const hash = bcrypt.hashSync(newPassword, 10);
        query = "UPDATE users SET username = ?, password = ? WHERE id = ?";
        params = [newUsername, hash, req.user.id];
    }

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Credentials updated successfully" });
    });
});

// ======================== PRODUCTS ROUTES ========================
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Parse JSON strings back to objects + normalise column names to camelCase for frontend
        const products = rows.map(r => {
            let images = [];
            try { images = JSON.parse(r.images || '[]'); } catch(e) { images = []; }
            if (images.length === 0 && r.image) images = [r.image];
            return {
                id:           r.id,
                name:         r.name,
                category:     r.category,
                categoryName: r.category_name,
                price:        r.price,
                oldPrice:     r.old_price,
                rating:       r.rating,
                reviewsCount: r.reviews_count,
                image:        r.image,
                images:       images,
                description:  r.description,
                sizes:        JSON.parse(r.sizes  || '[]'),
                colors:       JSON.parse(r.colors || '[]'),
                inStock:      r.in_stock === 1 || r.in_stock === true || r.in_stock === 'true',
                featured:     r.featured === 1 || r.featured === true || r.featured === 'true'
            };
        });
        res.json(products);
    });
});

app.post('/api/products', authenticateToken, isAdmin, upload.array('imagesFiles', 10), async (req, res) => {
    const { name, category, categoryName, price, oldPrice, description, sizes, colors, inStock, featured } = req.body;
    
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
        name, 
        category, 
        categoryName, 
        parseFloat(price || 0), 
        oldPrice ? parseFloat(oldPrice) : null, 
        5.0, 
        0, 
        mainImage, 
        JSON.stringify(finalImages), 
        description, 
        sizes || '[]',
        colors || '[]',
        inStock === 'true' ? 1 : 0, 
        featured === 'true' ? 1 : 0
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: "Product added successfully" });
    });
});

app.put('/api/products/:id', authenticateToken, isAdmin, upload.array('imagesFiles', 10), async (req, res) => {
    const { name, category, categoryName, price, oldPrice, description, sizes, colors, inStock, featured, existingImages } = req.body;
    
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
        name, 
        category, 
        categoryName, 
        parseFloat(price || 0), 
        oldPrice ? parseFloat(oldPrice) : null, 
        mainImage, 
        JSON.stringify(finalImages), 
        description, 
        sizes || '[]', 
        colors || '[]', 
        inStock === 'true' ? 1 : 0, 
        featured === 'true' ? 1 : 0, 
        req.params.id
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product updated successfully" });
    });
});

app.delete('/api/products/:id', authenticateToken, isAdmin, (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product deleted" });
    });
});

// ======================== SETTINGS ROUTES ========================
app.get('/api/settings', (req, res) => {
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        res.json(settings);
    });
});

app.put('/api/settings', authenticateToken, isAdmin, async (req, res) => {
    const { bank_account, instapay, ewallets, cash_on_delivery_enabled } = req.body;
    const updates = [];
    
    const runQuery = (key, val) => {
        return new Promise((resolve, reject) => {
            db.run("UPDATE settings SET value = ? WHERE key = ?", [val, key], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };

    try {
        if (bank_account !== undefined) updates.push(runQuery('bank_account', bank_account));
        if (instapay !== undefined) updates.push(runQuery('instapay', instapay));
        if (ewallets !== undefined) updates.push(runQuery('ewallets', ewallets));
        if (cash_on_delivery_enabled !== undefined) {
            updates.push(runQuery('cash_on_delivery_enabled', cash_on_delivery_enabled.toString()));
        }
        
        await Promise.all(updates);
        res.json({ message: "Settings updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ======================== ORDERS ROUTES ========================
app.post('/api/orders', (req, res) => {
    const { customer_name, phone, address, governorate, city, payment_method, subtotal, discount, total, items, payment_sender, payment_reference } = req.body;
    
    const orderNumber = 'VL-' + Math.floor(10000 + Math.random() * 90000);
    const initialStatus = payment_method === 'cod' ? 'pending' : 'pending_payment_verification';
    
    db.run(`INSERT INTO orders 
        (order_number, customer_name, phone, address, governorate, city, payment_method, subtotal, discount, total, status, payment_sender, payment_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [orderNumber, customer_name, phone, address, governorate, city, payment_method, subtotal, discount, total, initialStatus, payment_sender || null, payment_reference || null], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            const orderId = this.lastID;
            const itemPromises = items.map(item => {
                return new Promise((resolve, reject) => {
                    db.run(
                        "INSERT INTO order_items (order_id, product_name, quantity, price, size, color) VALUES (?, ?, ?, ?, ?, ?)",
                        [orderId, item.name, item.quantity, item.price, item.size, item.color],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            });
            
            Promise.all(itemPromises)
                .then(() => {
                    res.json({ orderNumber, message: "Order placed successfully" });
                })
                .catch(insErr => {
                    res.status(500).json({ error: insErr.message });
                });
        }
    );
});

app.get('/api/orders', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT * FROM orders ORDER BY created_at DESC", [], (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.all("SELECT * FROM order_items", [], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            
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
    const { status } = req.body;
    db.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Order status updated successfully" });
    });
});

app.delete('/api/orders/:id', authenticateToken, isAdmin, (req, res) => {
    db.run("DELETE FROM order_items WHERE order_id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run("DELETE FROM orders WHERE id = ?", [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Order deleted successfully" });
        });
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});
