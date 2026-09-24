const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname)
    ? (window.location.protocol.startsWith('http') ? window.location.protocol + '//' + window.location.hostname + ':3000/api' : 'http://localhost:3000/api')
    : window.location.origin + '/api';
let authToken = localStorage.getItem('adminToken') || localStorage.getItem('authToken') || null;

// ─── Session Timeout (10 minutes inactivity auto-logout) ──────────────────
const SESSION_TIMEOUT_MS  = 10 * 60 * 1000;   // 10 minutes
const SESSION_WARNING_MS  = 60 * 1000;         // warn 60 s before
let   sessionTimer        = null;
let   warningTimer        = null;
let   countdownInterval   = null;

function resetSessionTimer() {
    clearTimeout(sessionTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    hideSessionWarning();

    if (!authToken) return;   // not logged in, skip

    // Set warning at (TIMEOUT - WARNING)
    warningTimer = setTimeout(() => {
        showSessionWarning();
    }, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);

    // Set forced logout at TIMEOUT
    sessionTimer = setTimeout(() => {
        forceLogout();
    }, SESSION_TIMEOUT_MS);
}

function showSessionWarning() {
    const overlay = document.getElementById('sessionWarningOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    let secs = Math.round(SESSION_WARNING_MS / 1000);
    document.getElementById('sessionCountdown').textContent = secs;
    countdownInterval = setInterval(() => {
        secs--;
        const el = document.getElementById('sessionCountdown');
        if (el) el.textContent = secs;
        if (secs <= 0) clearInterval(countdownInterval);
    }, 1000);
}
function hideSessionWarning() {
    const overlay = document.getElementById('sessionWarningOverlay');
    if (overlay) overlay.style.display = 'none';
    clearInterval(countdownInterval);
}
function extendSession() {
    // Re-login silently using stored credentials is not possible without password;
    // instead just reset the local timer (token still expires server-side)
    resetSessionTimer();
}
function forceLogout() {
    clearTimeout(sessionTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    authToken = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('authToken');
    document.documentElement.classList.remove('user-authenticated');
    showLogin();
    hideSessionWarning();
}

// Reset timer only on actual interaction/work events (no mousemove to avoid accidental extensions)
['click', 'keydown', 'input', 'change', 'submit', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetSessionTimer, { passive: true });
});

// --- DOM Elements ---
const loginScreen      = document.getElementById('loginScreen');
const adminDashboard   = document.getElementById('adminDashboard');
const loginForm        = document.getElementById('adminLoginForm');
const loginError       = document.getElementById('loginError');
const logoutBtn        = document.getElementById('logoutBtn');

// Navigation
const navBtns   = document.querySelectorAll('.admin-nav-btn');
const sections  = document.querySelectorAll('.admin-section');

// Forms & Views
const paymentSettingsForm = document.getElementById('paymentSettingsForm');
const accountForm         = document.getElementById('accountForm');
const productForm         = document.getElementById('productForm');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
    } else {
        showLogin();
    }
    initColorWidgets();
    loadPublicTheme();
});

// Applies the saved theme (color + mode) on page load, before login as well.
// GET /api/settings is public, so the login screen shows the store's theme.
async function loadPublicTheme() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.theme_color) {
            applyThemeColor(data.theme_color);
            updateThemeColorInput(data.theme_color);
        }
        if (data.theme_mode) {
            localStorage.setItem('theme_mode', data.theme_mode);
            applyThemeMode(data.theme_mode);
        }
    } catch (e) {
        // Fall back to locally remembered theme if the API is unreachable
        const cachedMode = localStorage.getItem('theme_mode');
        if (cachedMode) applyThemeMode(cachedMode);
    }
}

// ===== Color Picker Widgets =====
function initColorWidgets() {
    [1, 2].forEach(n => {
        const widget     = document.getElementById(`colorWidget${n}`);
        const picker     = document.getElementById(`colorPicker${n}`);
        const nameInput  = document.getElementById(`colorName${n}`);
        const preview    = document.getElementById(`colorPreview${n}`);
        const hidden     = document.getElementById(`prodColor${n}`);
        if (!widget) return;

        const swatches = widget.querySelectorAll('.color-swatch');

        function updateWidget(code, name, sourceEl) {
            // Highlight selected swatch
            swatches.forEach(s => s.classList.remove('selected'));
            if (sourceEl) sourceEl.classList.add('selected');

            if (code) {
                preview.style.background = code;
                picker.value = code.length === 7 ? code : '#111111';
                nameInput.value = name || nameInput.value;
                hidden.value = `${nameInput.value}:${code}`;
            } else {
                // "No second color" selected
                preview.style.background = 'repeating-linear-gradient(45deg,#555,#555 3px,#333 3px,#333 6px)';
                nameInput.value = '';
                hidden.value = '';
            }
        }

        // Swatch click
        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                updateWidget(swatch.dataset.code, swatch.dataset.name, swatch);
            });
        });

        // Native color picker change
        picker.addEventListener('input', () => {
            swatches.forEach(s => s.classList.remove('selected'));
            preview.style.background = picker.value;
            hidden.value = `${nameInput.value || 'مخصص'}:${picker.value}`;
        });

        // Name input change
        nameInput.addEventListener('input', () => {
            if (picker.value) {
                hidden.value = `${nameInput.value}:${picker.value}`;
            }
        });

        // Set default for color 1
        if (n === 1) {
            const firstSwatch = widget.querySelector('.color-swatch:not(.color-swatch-none)');
            if (firstSwatch) firstSwatch.classList.add('selected');
            hidden.value = `${nameInput.value}:${picker.value}`;
        }
    });
}

// Helper: populate color widget from saved color object {name, code}
function setColorWidget(n, colorObj) {
    const widget    = document.getElementById(`colorWidget${n}`);
    const picker    = document.getElementById(`colorPicker${n}`);
    const nameInput = document.getElementById(`colorName${n}`);
    const preview   = document.getElementById(`colorPreview${n}`);
    const hidden    = document.getElementById(`prodColor${n}`);
    if (!widget) return;

    const swatches = widget.querySelectorAll('.color-swatch');
    swatches.forEach(s => s.classList.remove('selected'));

    if (!colorObj || !colorObj.code) {
        // select "none" if available (widget 2)
        const noneSwatch = widget.querySelector('.color-swatch-none');
        if (noneSwatch) noneSwatch.classList.add('selected');
        if (nameInput) nameInput.value = '';
        if (preview) preview.style.background = 'repeating-linear-gradient(45deg,#555,#555 3px,#333 3px,#333 6px)';
        if (hidden) hidden.value = '';
        return;
    }

    nameInput.value = colorObj.name || '';
    picker.value = colorObj.code.length === 7 ? colorObj.code : '#111111';
    preview.style.background = colorObj.code;
    hidden.value = `${colorObj.name}:${colorObj.code}`;

    // Try to find matching swatch
    const match = [...swatches].find(s => s.dataset.code && s.dataset.code.toLowerCase() === colorObj.code.toLowerCase());
    if (match) match.classList.add('selected');
}



// --- Auth Functions ---
function showLogin() {
    document.documentElement.classList.remove('user-authenticated');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (adminDashboard) adminDashboard.style.display = 'none';
    // Clear any running timers
    clearTimeout(sessionTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    hideSessionWarning();
}

function showDashboard() {
    document.documentElement.classList.add('user-authenticated');
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminDashboard) adminDashboard.style.display = 'flex';
    fetchOrders();
    fetchCategoriesAdmin();
    fetchSettings();
    resetSessionTimer();   // Start the 10-minute idle timer
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        
        if (res.ok && data.role === 'admin') {
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            localStorage.setItem('authToken', authToken);
            if (loginError) loginError.textContent = '';
            showDashboard();
        } else {
            loginError.textContent = data.error || 'غير مصرح لك بالدخول';
        }
    } catch (err) {
        loginError.textContent = 'خطأ في الاتصال بالخادم';
    }
});

logoutBtn.addEventListener('click', () => {
    forceLogout();
});

// --- Navigation ---
document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.admin-nav-btn');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;

            // Highlight active button
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Hide all admin sections
            const allSections = document.querySelectorAll('.admin-section');
            allSections.forEach(sec => sec.style.display = 'none');

            // Show selected section
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';
            }

            // Refresh data safely
            try {
                if (targetId === 'ordersView' && typeof fetchOrders === 'function') fetchOrders();
                if (targetId === 'productsView' && typeof fetchProductsAdmin === 'function') fetchProductsAdmin();
                if (targetId === 'categoriesView' && typeof fetchCategoriesAdmin === 'function') fetchCategoriesAdmin();
                if (targetId === 'commentsAdminView' && typeof fetchCommentsAdmin === 'function') fetchCommentsAdmin();
                if (targetId === 'settingsView' && typeof fetchSettings === 'function') fetchSettings();
            } catch (err) {
                console.error('Navigation fetch error:', err);
            }
        });
    });

    // Global ESC Key Handler for Admin Modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            if (typeof closeOrderModal === 'function') closeOrderModal();
            if (typeof closeProductModal === 'function') closeProductModal();
            if (typeof closeCategoryFormCard === 'function') closeCategoryFormCard();
        }
    });
});

// --- Account Management ---
accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('accUsername').value;
    const newPassword = document.getElementById('accPassword').value;
    const currentPassword = document.getElementById('accCurrentPassword').value;
    const feedback = document.getElementById('accountFeedback');
    
    try {
        const res = await fetch(`${API_URL}/auth/update`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ newUsername, newPassword: newPassword || undefined, currentPassword })
        });
        const data = await res.json();
        
        if (res.ok) {
            feedback.style.color = '';
            feedback.textContent = 'تم تحديث بيانات الدخول بنجاح. قد تحتاج لتسجيل الدخول مجدداً.';
            setTimeout(() => { logoutBtn.click(); }, 3000);
        } else {
            feedback.textContent = data.error || 'حدث خطأ';
            feedback.style.color = 'var(--color-danger)';
        }
    } catch (err) {
        console.error(err);
    }
});

// --- Settings Management ---
function addAnnouncementRow(text = '') {
    const container = document.getElementById('announcementRowsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'announcement-row';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    row.innerHTML = `
        <input type="text" class="announcement-input-val form-control" style="flex:1; background:var(--color-bg-tertiary); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:10px; color:#fff;" placeholder="مثال: 🚚 شحن مجاني للطلبات أكثر من 3,000 ج.م" value="${text.replace(/"/g, '&quot;')}">
        <button type="button" class="btn btn-outline" style="color:var(--color-danger); border-color:rgba(239, 68, 68, 0.4); padding:9px 12px; border-radius:var(--radius-sm);" onclick="this.parentElement.remove()">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    container.appendChild(row);
}

// Make it globally accessible for inline onclick
window.addAnnouncementRow = addAnnouncementRow;

async function fetchSettings() {
    try {
        const res  = await fetch(`${API_URL}/settings`);
        const data = await res.json();

        // Payment fields
        if (data.bank_account)           document.getElementById('setBank').value    = data.bank_account;
        if (data.instapay)               document.getElementById('setInstapay').value = data.instapay;
        if (data.ewallets)               document.getElementById('setEwallets').value  = data.ewallets;
        if (data.cash_on_delivery_enabled)
            document.getElementById('setCod').checked = (data.cash_on_delivery_enabled === 'true');



        // Announcement fields
        const annEnabled = document.getElementById('setAnnouncementEnabled');
        if (annEnabled && data.announcement_enabled !== undefined) {
            annEnabled.checked = (data.announcement_enabled === 'true');
        }

        const container = document.getElementById('announcementRowsContainer');
        if (container) {
            container.innerHTML = '';
            let texts = [];
            if (data.announcement_text) {
                try {
                    texts = JSON.parse(data.announcement_text);
                    if (!Array.isArray(texts)) texts = [data.announcement_text];
                } catch(e) {
                    texts = data.announcement_text.split('|').map(t => t.trim()).filter(Boolean);
                }
            }
            if (texts.length === 0) {
                addAnnouncementRow('');
            } else {
                texts.forEach(t => addAnnouncementRow(t));
            }
        }

        // Theme Color & Mode fields
        if (data.theme_color) {
            updateThemeColorInput(data.theme_color);
            applyThemeColor(data.theme_color);
        }
        if (data.theme_mode) {
            localStorage.setItem('theme_mode', data.theme_mode);
            applyThemeMode(data.theme_mode);
            const radio = document.querySelector(`input[name="themeModeRadio"][value="${data.theme_mode}"]`);
            if (radio) radio.checked = true;
        }

        // Hero Slider fields
        if (data.hero_slides) {
            try {
                const slides = JSON.parse(data.hero_slides);
                if (slides[0]) {
                    if (document.getElementById('heroImgUrl1')) document.getElementById('heroImgUrl1').value = slides[0].image || '';
                    if (document.getElementById('heroPreview1')) document.getElementById('heroPreview1').src = slides[0].image || './assets/images/hero_slide_1.jpg';
                    if (document.getElementById('heroTitle1')) document.getElementById('heroTitle1').value = slides[0].title || '';
                    if (document.getElementById('heroSubtitle1')) document.getElementById('heroSubtitle1').value = slides[0].subtitle || '';
                    if (document.getElementById('heroDesc1')) document.getElementById('heroDesc1').value = slides[0].description || '';
                }
                if (slides[1]) {
                    if (document.getElementById('heroImgUrl2')) document.getElementById('heroImgUrl2').value = slides[1].image || '';
                    if (document.getElementById('heroPreview2')) document.getElementById('heroPreview2').src = slides[1].image || './assets/images/hero_slide_2.jpg';
                    if (document.getElementById('heroTitle2')) document.getElementById('heroTitle2').value = slides[1].title || '';
                    if (document.getElementById('heroSubtitle2')) document.getElementById('heroSubtitle2').value = slides[1].subtitle || '';
                    if (document.getElementById('heroDesc2')) document.getElementById('heroDesc2').value = slides[1].description || '';
                }
            } catch(e) {}
        }

        // Store Features fields
        const featContainer = document.getElementById('featureRowsContainer');
        if (featContainer) {
            featContainer.innerHTML = '';
            let features = [];
            if (data.store_features) {
                try {
                    features = JSON.parse(data.store_features);
                } catch(e) {}
            }
            if (!Array.isArray(features) || features.length === 0) {
                addFeatureRow('شحن سريع ومجاني', 'شحن خلال 24-48 ساعة لجميع المحافظات', 'fa-truck-fast');
                addFeatureRow('استرجاع واستبدال مرن', 'خلال 14 يوماً بكل سهولة وسلاسة', 'fa-rotate-left');
                addFeatureRow('جودة مضمونة 100%', 'منتجات أصلية من خامات طبيعية ممتازة', 'fa-shield-halved');
            } else {
                features.forEach(f => addFeatureRow(f.title, f.desc, f.icon));
            }
        }
    } catch(err) { console.error(err); }
}

async function saveAnnouncementSettings() {
    const inputs = document.querySelectorAll('.announcement-input-val');
    const texts = Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
    const enabled = document.getElementById('setAnnouncementEnabled').checked;
    const feedback = document.getElementById('announcementFeedback');

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ 
                announcement_text: JSON.stringify(texts), 
                announcement_enabled: enabled.toString() 
            })
        });
        if (res.ok) {
            feedback.style.color = 'var(--color-success)';
            feedback.textContent = '✅ تم حفظ الإعلانات بنجاح';
        } else {
            const d = await res.json();
            if (res.status === 401 || res.status === 403) { forceLogout(); return; }
            feedback.style.color = 'var(--color-danger)';
            feedback.textContent = d.error || 'حدث خطأ';
        }
    } catch(err) {
        feedback.textContent = 'خطأ في الاتصال';
    }
    setTimeout(() => { feedback.textContent = ''; }, 3500);
}

async function clearAnnouncement() {
    if (!confirm('هل تريد حذف جميع الإعلانات وإخفاء الشريط؟')) return;
    const feedback = document.getElementById('announcementFeedback');
    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ announcement_text: '[]', announcement_enabled: 'false' })
        });
        if (res.ok) {
            const container = document.getElementById('announcementRowsContainer');
            if (container) container.innerHTML = '';
            addAnnouncementRow('');
            document.getElementById('setAnnouncementEnabled').checked = false;
            feedback.style.color = 'var(--color-success)';
            feedback.textContent = '✅ تم حذف جميع الإعلانات';
        } else if (res.status === 401 || res.status === 403) { forceLogout(); return; }
    } catch(err) { feedback.textContent = 'خطأ في الاتصال'; }
    setTimeout(() => { feedback.textContent = ''; }, 3500);
}

paymentSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        bank_account: document.getElementById('setBank').value,
        instapay: document.getElementById('setInstapay').value,
        ewallets: document.getElementById('setEwallets').value,
        cash_on_delivery_enabled: document.getElementById('setCod').checked
    };
    
    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            document.getElementById('settingsFeedback').textContent = 'تم حفظ الإعدادات بنجاح';
            setTimeout(() => { document.getElementById('settingsFeedback').textContent = ''; }, 3000);
        }
    } catch (err) { console.error(err); }
});

// --- Products Management ---
let adminProducts = [];

async function fetchProductsAdmin() {
    try {
        const res = await fetch(`${API_URL}/products`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        adminProducts = Array.isArray(data) ? data : [];
        renderAdminProducts();
    } catch (err) {
        console.error('fetchProductsAdmin error:', err);
        document.getElementById('adminProductsGrid').innerHTML =
            `<p style="color:var(--color-danger);text-align:center;">خطأ في تحميل المنتجات</p>`;
    }
}

function renderAdminProducts() {
    const grid = document.getElementById('adminProductsGrid');
    grid.innerHTML = '';
    
    adminProducts.forEach(p => {
        grid.innerHTML += `
            <div class="admin-product-card">
                <img src="${p.image}" class="admin-product-img">
                <div class="admin-product-info">
                    <h4 style="font-size: 1rem; margin-bottom: 5px;">${p.name}</h4>
                    <p class="text-gold font-bold">${p.price} ج.م</p>
                </div>
                <div class="admin-product-actions">
                    <button class="btn btn-outline" style="flex:1; padding: 5px;" onclick="editProduct(${p.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
                    <button class="btn btn-secondary" style="flex:1; padding: 5px; color: var(--color-danger); border-color: var(--color-danger);" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i> حذف</button>
                </div>
            </div>
        `;
    });
}

let currentEditingImages = [];

function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';
    
    // Render existing images
    currentEditingImages.forEach((img, index) => {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.width = '80px';
        wrapper.style.height = '80px';
        wrapper.style.borderRadius = 'var(--radius-md)';
        wrapper.style.overflow = 'hidden';
        wrapper.style.border = '1px solid var(--color-border)';
        
        const image = document.createElement('img');
        image.src = img;
        image.style.width = '100%';
        image.style.height = '100%';
        image.style.objectFit = 'cover';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '2px';
        deleteBtn.style.left = '2px';
        deleteBtn.style.background = 'rgba(255, 69, 58, 0.8)';
        deleteBtn.style.color = '#fff';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = 'var(--radius-sm)';
        deleteBtn.style.padding = '3px 6px';
        deleteBtn.style.fontSize = '0.75rem';
        deleteBtn.onclick = () => {
            currentEditingImages.splice(index, 1);
            document.getElementById('prodImage').value = JSON.stringify(currentEditingImages);
            renderImagePreviews();
        };
        
        wrapper.appendChild(image);
        wrapper.appendChild(deleteBtn);
        container.appendChild(wrapper);
    });

    // Render newly selected files
    const fileInput = document.getElementById('prodImageFiles');
    if (fileInput && fileInput.files) {
        Array.from(fileInput.files).forEach((file, index) => {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.width = '80px';
            wrapper.style.height = '80px';
            wrapper.style.borderRadius = 'var(--radius-md)';
            wrapper.style.overflow = 'hidden';
            wrapper.style.border = '1px solid var(--color-border)';
            wrapper.style.opacity = '0.85';
            
            const image = document.createElement('img');
            image.src = URL.createObjectURL(file);
            image.style.width = '100%';
            image.style.height = '100%';
            image.style.objectFit = 'cover';
            
            const badge = document.createElement('span');
            badge.innerText = 'جديد';
            badge.style.position = 'absolute';
            badge.style.bottom = '2px';
            badge.style.right = '2px';
            badge.style.background = 'var(--color-gold)';
            badge.style.color = '#000';
            badge.style.fontSize = '0.65rem';
            badge.style.fontWeight = 'bold';
            badge.style.padding = '1px 5px';
            badge.style.borderRadius = '3px';
            
            wrapper.appendChild(image);
            wrapper.appendChild(badge);
            container.appendChild(wrapper);
        });
    }
}

// Add event listener to file input for live previewing on file selection
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('prodImageFiles');
    if (fileInput) {
        fileInput.addEventListener('change', renderImagePreviews);
    }
});

const modal = document.getElementById('productModal');
function openProductModal() {
    document.getElementById('productForm').reset();
    document.getElementById('prodId').value = '';
    document.getElementById('prodImage').value = '';
    document.getElementById('prodImageFiles').value = '';
    document.getElementById('imagePreviewContainer').innerHTML = '';
    currentEditingImages = [];
    // Reset color widgets to defaults
    setColorWidget(1, { name: 'أسود', code: '#111111' });
    setColorWidget(2, null);
    document.getElementById('productModalTitle').textContent = 'إضافة منتج جديد';
    modal.classList.add('active');
}
function closeProductModal() {
    modal.classList.remove('active');
}

function editProduct(id) {
    const p = adminProducts.find(x => x.id === id);
    if (!p) return;
    
    document.getElementById('prodId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodOldPrice').value = p.oldPrice || '';
    document.getElementById('prodCategory').value = p.category;
    document.getElementById('prodCategoryName').value = p.categoryName;
    document.getElementById('prodImage').value = JSON.stringify(p.images || []);
    document.getElementById('prodDesc').value = p.description;
    
    document.getElementById('prodSizes').value = p.sizes ? p.sizes.join(', ') : '';
    setColorWidget(1, p.colors && p.colors[0] ? p.colors[0] : null);
    setColorWidget(2, p.colors && p.colors[1] ? p.colors[1] : null);
    
    document.getElementById('prodInStock').checked = p.inStock;
    document.getElementById('prodFeatured').checked = p.featured;
    
    currentEditingImages = p.images ? [...p.images] : [];
    renderImagePreviews();
    
    document.getElementById('productModalTitle').textContent = 'تعديل المنتج';
    modal.classList.add('active');
}

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('prodId').value;
    const sizesStr = document.getElementById('prodSizes').value;
    const sizes = sizesStr ? sizesStr.split(',').map(s => s.trim()) : [];
    
    const colors = [];
    const c1 = document.getElementById('prodColor1').value;
    if(c1 && c1.includes(':')) { const [n,c] = c1.split(':'); if(n && c) colors.push({ name: n.trim(), code: c.trim(), secondary: c.trim() }); }
    
    const c2 = document.getElementById('prodColor2').value;
    if(c2 && c2.includes(':')) { const [n,c] = c2.split(':'); if(n && c) colors.push({ name: n.trim(), code: c.trim(), secondary: c.trim() }); }
    
    const fileInput = document.getElementById('prodImageFiles');
    if (!id && fileInput.files.length === 0) {
        alert('يرجى تحميل صورة واحدة على الأقل للمنتج الجديد.');
        return;
    }
    
    const formData = new FormData();
    formData.append('name', document.getElementById('prodName').value);
    formData.append('category', document.getElementById('prodCategory').value);
    formData.append('categoryName', document.getElementById('prodCategoryName').value);
    formData.append('price', document.getElementById('prodPrice').value);
    formData.append('oldPrice', document.getElementById('prodOldPrice').value || '');
    formData.append('description', document.getElementById('prodDesc').value);
    formData.append('sizes', JSON.stringify(sizes));
    formData.append('colors', JSON.stringify(colors));
    formData.append('inStock', document.getElementById('prodInStock').checked ? 'true' : 'false');
    formData.append('featured', document.getElementById('prodFeatured').checked ? 'true' : 'false');
    formData.append('existingImages', document.getElementById('prodImage').value || '[]');
    
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('imagesFiles', fileInput.files[i]);
    }
    
    const url = id ? `${API_URL}/products/${id}` : `${API_URL}/products`;
    const method = id ? 'PUT' : 'POST';
    
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        if (res.ok) {
            closeProductModal();
            fetchProductsAdmin();
        } else {
            if (res.status === 401 || res.status === 403) {
                alert('انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول.');
                forceLogout();
                return;
            }
            const data = await res.json();
            alert(data.error || 'حدث خطأ أثناء حفظ المنتج.');
        }
    } catch(err) { 
        console.error(err); 
        alert('خطأ في الاتصال بالخادم.');
    }
});

async function deleteProduct(id) {
    if(!confirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟')) return;
    try {
        const res = await fetch(`${API_URL}/products/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) fetchProductsAdmin();
    } catch(err) { console.error(err); }
}

// --- Orders Management ---
let adminOrders = [];

async function fetchOrders() {
    try {
        const res = await fetch(`${API_URL}/orders`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.status === 401 || res.status === 403) {
            // Token expired or invalid — force logout
            authToken = null;
            localStorage.removeItem('adminToken');
            showLogin();
            return;
        }
        const data = await res.json();
        adminOrders = Array.isArray(data) ? data : [];
        renderOrders();
    } catch(err) {
        console.error('fetchOrders error:', err);
        document.getElementById('ordersTableBody').innerHTML =
            `<tr><td colspan="7" class="text-center" style="color:var(--color-danger)">خطأ في تحميل الطلبات</td></tr>`;
    }
}

function getPaymentMethodName(method) {
    switch (method) {
        case 'cod': return 'الدفع عند الاستلام';
        case 'card': return 'بطاقة ائتمان';
        case 'bank': return 'تحويل بنكي';
        case 'instapay': return 'انستا باي';
        case 'ewallet': return 'محفظة إلكترونية';
        default: return method;
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'pending':
            return `<span class="status-badge status-pending">قيد المراجعة</span>`;
        case 'pending_payment_verification':
            return `<span class="status-badge status-verification">بانتظار تحقق الدفع</span>`;
        case 'completed':
            return `<span class="status-badge status-completed">تم التوصيل</span>`;
        case 'cancelled':
            return `<span class="status-badge status-cancelled">ملغي</span>`;
        default:
            return `<span class="status-badge status-pending">${status}</span>`;
    }
}

function renderOrders() {
    const tbody = document.getElementById('ordersTableBody');
    const mobileGrid = document.getElementById('ordersMobileGrid');

    if (tbody) tbody.innerHTML = '';
    if (mobileGrid) mobileGrid.innerHTML = '';

    if (adminOrders.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center">لا توجد طلبات بعد</td></tr>`;
        if (mobileGrid) mobileGrid.innerHTML = `<div class="admin-card text-center text-muted p-4">لا توجد طلبات بعد</div>`;
        return;
    }

    adminOrders.forEach(o => {
        const date = new Date(o.created_at).toLocaleDateString('ar-EG');
        const statusBadge = getStatusBadge(o.status);
        const totalFormatted = (o.total || 0).toLocaleString('ar-EG');

        if (tbody) {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>${date}</td>
                    <td>${o.customer_name}</td>
                    <td class="text-gold font-bold">${totalFormatted} ج.م</td>
                    <td>${getPaymentMethodName(o.payment_method)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-outline" style="padding: 5px 8px; font-size: 0.85rem;" onclick="viewOrder(${o.id})" title="عرض التفاصيل"><i class="fa-solid fa-eye"></i> عرض</button>
                            <button class="btn btn-secondary" style="padding: 5px 8px; font-size: 0.85rem; color: var(--color-danger); border-color: var(--color-danger);" onclick="deleteOrder(${o.id})" title="حذف الطلب"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }

        if (mobileGrid) {
            mobileGrid.innerHTML += `
                <div class="admin-order-card-mobile">
                    <div class="order-card-header">
                        <div class="order-num">
                            <i class="fa-solid fa-receipt text-gold"></i>
                            <strong>${o.order_number}</strong>
                        </div>
                        <div class="order-status-wrapper">
                            ${statusBadge}
                        </div>
                    </div>
                    <div class="order-card-body">
                        <div class="order-meta-item">
                            <span class="meta-label"><i class="fa-solid fa-user"></i> العميل:</span>
                            <span class="meta-val">${o.customer_name}</span>
                        </div>
                        <div class="order-meta-item">
                            <span class="meta-label"><i class="fa-solid fa-phone"></i> الهاتف:</span>
                            <span class="meta-val"><a href="tel:${o.phone}" style="color:var(--color-gold);text-decoration:none;">${o.phone}</a></span>
                        </div>
                        <div class="order-meta-item">
                            <span class="meta-label"><i class="fa-solid fa-location-dot"></i> العنوان:</span>
                            <span class="meta-val">${o.governorate || ''} - ${o.city || ''} (${o.address || ''})</span>
                        </div>
                        <div class="order-meta-item">
                            <span class="meta-label"><i class="fa-solid fa-credit-card"></i> طريقة الدفع:</span>
                            <span class="meta-val">${getPaymentMethodName(o.payment_method)}</span>
                        </div>
                        <div class="order-meta-item">
                            <span class="meta-label"><i class="fa-regular fa-calendar"></i> التاريخ:</span>
                            <span class="meta-val">${date}</span>
                        </div>
                    </div>
                    <div class="order-card-footer">
                        <div class="order-total-pill">
                            <span>المبلغ:</span>
                            <strong>${totalFormatted} ج.م</strong>
                        </div>
                        <div class="order-actions">
                            <button class="btn btn-outline" onclick="viewOrder(${o.id})">
                                <i class="fa-solid fa-eye"></i> التفاصيل
                            </button>
                            <button class="btn btn-outline danger" onclick="deleteOrder(${o.id})">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    });
}

async function deleteOrder(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    try {
        const res = await fetch(`${API_URL}/orders/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            fetchOrders();
        } else {
            const data = await res.json();
            alert(data.error || 'حدث خطأ أثناء حذف الطلب.');
        }
    } catch(err) {
        console.error(err);
        alert('خطأ في الاتصال بالخادم.');
    }
}

function downloadOrdersPDF() {
    if (adminOrders.length === 0) {
        alert('لا توجد طلبات لحفظها كـ PDF.');
        return;
    }

    // Calculate report statistics
    const totalOrdersCount = adminOrders.length;
    const totalSales = adminOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const codOrders = adminOrders.filter(o => o.payment_method === 'cod').length;
    const cardOrders = totalOrdersCount - codOrders;

    // Create wrapper container formatted for PDF print layout
    const container = document.createElement('div');
    container.setAttribute('dir', 'rtl');
    container.style.padding = '35px';
    container.style.color = '#1f2937';
    container.style.background = '#ffffff';
    container.style.fontFamily = 'Cairo, Tajawal, sans-serif';

    // 1. Beautiful Header Banner
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '3px double #D4AF37';
    header.style.paddingBottom = '15px';
    header.style.marginBottom = '25px';
    header.innerHTML = `
        <div style="text-align: right;">
            <h1 style="color: #111; margin: 0; font-size: 1.8rem; font-weight: 800; letter-spacing: 2px;">
                <span style="color: #D4AF37;">DA VINCI</span> STORE
            </h1>
            <p style="font-size: 0.85rem; color: #6b7280; margin: 5px 0 0 0;">كشف وتفاصيل طلبات العملاء الفاخر</p>
        </div>
        <div style="text-align: left; font-size: 0.8rem; color: #4b5563;">
            <p style="margin: 0; font-weight: bold;">تاريخ التصدير: <span style="color: #111;">${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></p>
            <p style="margin: 3px 0 0 0;">الحالة العامة للمتجر: <span style="color: #059669; font-weight: bold;">نشط ومستقر</span></p>
        </div>
    `;

    // 2. Modern Statistics Cards Section
    const statsContainer = document.createElement('div');
    statsContainer.style.display = 'grid';
    statsContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
    statsContainer.style.gap = '15px';
    statsContainer.style.marginBottom = '25px';
    statsContainer.innerHTML = `
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 4px; font-weight: 600;">إجمالي المبيعات</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #D4AF37;">${totalSales.toLocaleString('ar-EG')} ج.م</div>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 4px; font-weight: 600;">عدد الطلبات</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #111;">${totalOrdersCount} طلب</div>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 4px; font-weight: 600;">الدفع عند الاستلام</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #4b5563;">${codOrders} طلب</div>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
            <div style="font-size: 0.75rem; color: #6b7280; margin-bottom: 4px; font-weight: 600;">الدفع الإلكتروني</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #4b5563;">${cardOrders} طلب</div>
        </div>
    `;

    // 3. Beautiful Table
    const tableContainer = document.createElement('div');
    let rowsHtml = '';
    adminOrders.forEach((o, index) => {
        const date = new Date(o.created_at).toLocaleDateString('ar-EG');
        
        let paymentText = o.payment_method;
        let paymentBg = '#f3f4f6';
        let paymentColor = '#374151';
        switch (o.payment_method) {
            case 'cod': paymentText = 'عند الاستلام'; paymentBg = '#f3f4f6'; paymentColor = '#374151'; break;
            case 'card': paymentText = 'بطاقة ائتمان'; paymentBg = '#e0f2fe'; paymentColor = '#0369a1'; break;
            case 'bank': paymentText = 'تحويل بنكي'; paymentBg = '#f0fdf4'; paymentColor = '#166534'; break;
            case 'instapay': paymentText = 'انستا باي'; paymentBg = '#faf5ff'; paymentColor = '#6b21a8'; break;
            case 'ewallet': paymentText = 'محفظة إلكترونية'; paymentBg = '#fff7ed'; paymentColor = '#9a3412'; break;
        }

        let statusText = o.status;
        let statusBg = '#fef3c7';
        let statusColor = '#d97706';
        switch (o.status) {
            case 'pending': statusText = 'قيد المراجعة'; statusBg = '#fef3c7'; statusColor = '#d97706'; break;
            case 'pending_payment_verification': statusText = 'بانتظار تحقق الدفع'; statusBg = '#ffedd5'; statusColor = '#c2410c'; break;
            case 'completed': statusText = 'تم التوصيل'; statusBg = '#dcfce7'; statusColor = '#15803d'; break;
            case 'cancelled': statusText = 'ملغي'; statusBg = '#fee2e2'; statusColor = '#b91c1c'; break;
        }
        
        rowsHtml += `
            <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f9fafb'}; border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 10px; text-align: center; font-weight: 700; color: #111;">${o.order_number}</td>
                <td style="padding: 12px 10px; text-align: center; color: #4b5563;">${date}</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: 600; color: #1f2937;">${o.customer_name}</td>
                <td style="padding: 12px 10px; text-align: center; font-weight: bold; color: #D4AF37; font-size: 0.95rem;">${o.total.toLocaleString('ar-EG')} ج.م</td>
                <td style="padding: 12px 10px; text-align: center;">
                    <span style="background-color: ${paymentBg}; color: ${paymentColor}; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
                        ${paymentText}
                    </span>
                </td>
                <td style="padding: 12px 10px; text-align: center;">
                    <span style="background-color: ${statusBg}; color: ${statusColor}; padding: 4px 10px; border-radius: 50px; font-size: 0.75rem; font-weight: bold;">
                        ${statusText}
                    </span>
                </td>
            </tr>
        `;
    });

    tableContainer.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.01); font-size: 0.85rem;">
            <thead>
                <tr style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); color: #ffffff;">
                    <th style="padding: 12px 10px; font-weight: 700; border-bottom: 2px solid #D4AF37; text-align: center;">رقم الطلب</th>
                    <th style="padding: 12px 10px; font-weight: 700; border-bottom: 2px solid #D4AF37; text-align: center;">تاريخ الطلب</th>
                    <th style="padding: 12px 10px; font-weight: 700; border-bottom: 2px solid #D4AF37; text-align: right;">العميل</th>
                    <th style="padding: 12px 10px; font-weight: 700; border-bottom: 2px solid #D4AF37; text-align: center;">المبلغ الإجمالي</th>
                    <th style="padding: 12px 10px; font-weight: 700; border-bottom: 2px solid #D4AF37; text-align: center;">طريقة الدفع</th>
                    <th style="padding: 12px 10px; font-weight: 700; border-bottom: 2px solid #D4AF37; text-align: center;">الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;

    // 4. Beautiful Footer / Stamp Section
    const footer = document.createElement('div');
    footer.style.marginTop = '35px';
    footer.style.borderTop = '1px solid #e5e7eb';
    footer.style.paddingTop = '15px';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.alignItems = 'center';
    footer.style.fontSize = '0.75rem';
    footer.style.color = '#9ca3af';
    footer.innerHTML = `
        <div>DA VINCI STORE © 2026 - عنوان الأناقة والرقي</div>
        <div style="font-style: italic;">تقرير رسمي معتمد ومصدّق تلقائياً</div>
    `;

    // Append all sections
    container.appendChild(header);
    container.appendChild(statsContainer);
    container.appendChild(tableContainer);
    container.appendChild(footer);

    const opt = {
        margin:       12,
        filename:     `davinci_store_orders_${new Date().toISOString().slice(0,10)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2.5, backgroundColor: '#ffffff', useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    
    html2pdf().set(opt).from(container).save();
}

const oModal = document.getElementById('orderModal');
let currentViewingOrderId = null;

function viewOrder(id) {
    const o = adminOrders.find(x => x.id === id);
    if(!o) return;
    
    currentViewingOrderId = o.id;
    document.getElementById('modalOrderNumber').textContent = o.order_number;
    document.getElementById('moName').textContent = o.customer_name;
    document.getElementById('moPhone').textContent = o.phone;
    document.getElementById('moAddress').textContent = o.address;
    document.getElementById('moCity').textContent = o.city;
    document.getElementById('moGov').textContent = o.governorate;
    document.getElementById('moPayment').textContent = getPaymentMethodName(o.payment_method);
    document.getElementById('moTotal').textContent = o.total;
    
    const senderRow = document.getElementById('moPaymentSenderRow');
    const refRow = document.getElementById('moPaymentRefRow');
    
    if (o.payment_sender) {
        document.getElementById('moPaymentSender').textContent = o.payment_sender;
        senderRow.style.display = 'block';
    } else {
        senderRow.style.display = 'none';
    }
    
    if (o.payment_reference) {
        document.getElementById('moPaymentRef').textContent = o.payment_reference;
        refRow.style.display = 'block';
    } else {
        refRow.style.display = 'none';
    }
    
    document.getElementById('moStatusSelect').value = o.status || 'pending';
    
    const itemsTbody = document.getElementById('modalOrderItems');
    itemsTbody.innerHTML = '';
    o.items.forEach(i => {
        itemsTbody.innerHTML += `
            <tr>
                <td>${i.product_name}</td>
                <td>${i.size || '-'}</td>
                <td>${i.color || '-'}</td>
                <td>${i.quantity}</td>
                <td>${i.price} ج.م</td>
            </tr>
        `;
    });
    
    oModal.classList.add('active');
}

// Bind update order status button
const updateStatusBtn = document.getElementById('updateOrderStatusBtn');
if (updateStatusBtn) {
    updateStatusBtn.addEventListener('click', async () => {
        if (!currentViewingOrderId) return;
        const newStatus = document.getElementById('moStatusSelect').value;
        try {
            const res = await fetch(`${API_URL}/orders/${currentViewingOrderId}/status`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                alert('تم تحديث حالة الطلب بنجاح!');
                closeOrderModal();
                fetchOrders();
            } else {
                const data = await res.json();
                alert(data.error || 'حدث خطأ أثناء تحديث حالة الطلب.');
            }
        } catch(err) {
            console.error(err);
            alert('خطأ في الاتصال بالخادم.');
        }
    });
}

function closeOrderModal() {
    oModal.classList.remove('active');
}

// ── Mobile Sidebar Toggle Handler ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.getElementById('adminSidebarToggle');
    const sidebar       = document.querySelector('.admin-sidebar');
    const backdrop      = document.getElementById('adminSidebarBackdrop');

    function openSidebar() {
        sidebar.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
        sidebar.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.contains('active') ? closeSidebar() : openSidebar();
        });
        // Close when a nav item is tapped
        document.querySelectorAll('.admin-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => closeSidebar());
        });
        // Close on backdrop tap
        if (backdrop) {
            backdrop.addEventListener('click', () => closeSidebar());
        }
        // Close on logout
        const logoutButton = document.getElementById('logoutBtn');
        if (logoutButton) {
            logoutButton.addEventListener('click', () => closeSidebar());
        }
    }
});

// ─── Categories Management (Admin) ───────────────────────────────────────────
let adminCategories = [];

async function fetchCategoriesAdmin() {
    try {
        const res = await fetch(`${API_URL}/categories`);
        const data = await res.json();
        adminCategories = Array.isArray(data) ? data : [];
        renderCategoriesAdmin();
        populateProductCategorySelect();
    } catch (err) {
        console.error('fetchCategoriesAdmin error:', err);
    }
}

function renderCategoriesAdmin() {
    const tbody = document.getElementById('adminCategoriesTableBody') || document.getElementById('categoriesTableBody');
    const mobileGrid = document.getElementById('adminCategoriesMobileGrid');

    if (adminCategories.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:20px; color:var(--color-text-muted);">لا توجد فئات حالياً. اضغط "إضافة فئة جديدة" للبدء.</td></tr>`;
        if (mobileGrid) mobileGrid.innerHTML = `<div class="text-center" style="padding:25px; color:var(--color-text-muted);">لا توجد فئات حالياً. اضغط "إضافة فئة جديدة" للبدء.</div>`;
        return;
    }

    if (tbody) {
        tbody.innerHTML = adminCategories.map(c => {
            const imgPath = c.image || `./assets/images/cat_${c.key}.jpg`;
            return `
            <tr>
                <td style="width: 70px;">
                    <img src="${imgPath}" alt="${c.name}" style="width:55px; height:42px; object-fit:cover; border-radius:8px; border:1px solid var(--color-border);" onerror="this.src='./assets/images/cat_clothing.jpg'">
                </td>
                <td><strong style="color: var(--color-text-primary); font-size: 0.92rem;">${c.name}</strong></td>
                <td><span class="status-badge" style="background: rgba(212, 175, 55, 0.12); color: var(--color-gold); border: 1px solid rgba(212, 175, 55, 0.25); font-family: monospace;">${c.key}</span></td>
                <td><i class="fa-solid ${c.icon || 'fa-tag'}" style="color:var(--color-gold); font-size:1.05rem;"></i> <small style="color:var(--color-text-muted);">(${c.icon || 'fa-tag'})</small></td>
                <td style="white-space: nowrap; width: 140px;">
                    <button class="btn btn-outline" style="padding:4px 10px; font-size:0.8rem; margin-left:4px;" onclick="editCategory(${c.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
                    <button class="btn btn-outline" style="padding:4px 10px; font-size:0.8rem; color:var(--color-danger); border-color:rgba(239,68,68,0.3);" onclick="deleteCategory(${c.id})"><i class="fa-solid fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
        }).join('');
    }

    if (mobileGrid) {
        mobileGrid.innerHTML = adminCategories.map(c => {
            const imgPath = c.image || `./assets/images/cat_${c.key}.jpg`;
            return `
            <div class="category-admin-card">
                <div class="category-admin-card-header">
                    <img src="${imgPath}" alt="${c.name}" class="category-admin-card-img" onerror="this.src='./assets/images/cat_clothing.jpg'">
                    <div class="category-admin-card-info">
                        <h4>${c.name}</h4>
                        <div class="category-admin-card-tags">
                            <span class="status-badge" style="background: rgba(212, 175, 55, 0.12); color: var(--color-gold); border: 1px solid rgba(212, 175, 55, 0.25); font-family: monospace; font-size:0.75rem;">${c.key}</span>
                            <span style="font-size:0.8rem; color:var(--color-text-muted);"><i class="fa-solid ${c.icon || 'fa-tag'}" style="color:var(--color-gold);"></i> ${c.icon || 'fa-tag'}</span>
                        </div>
                    </div>
                </div>
                <div class="category-admin-card-actions">
                    <button class="btn btn-outline" style="padding:7px 12px; font-size:0.83rem;" onclick="editCategory(${c.id})"><i class="fa-solid fa-pen"></i> تعديل</button>
                    <button class="btn btn-outline" style="padding:7px 12px; font-size:0.83rem; color:var(--color-danger); border-color:rgba(239,68,68,0.3);" onclick="deleteCategory(${c.id})"><i class="fa-solid fa-trash"></i> حذف</button>
                </div>
            </div>
        `;
        }).join('');
    }
}

function populateProductCategorySelect() {
    const select = document.getElementById('prodCategory');
    if (!select) return;
    const currentVal = select.value;
    if (adminCategories.length > 0) {
        select.innerHTML = adminCategories.map(c => `
            <option value="${c.key}">${c.name} (${c.key})</option>
        `).join('');
        if (currentVal && adminCategories.some(c => c.key === currentVal)) {
            select.value = currentVal;
        }
    }
}

function handleCatKeySelectChange(val) {
    const select = document.getElementById('catKeySelect');
    const customInput = document.getElementById('catKeyCustom');
    const hiddenKey = document.getElementById('catKey');
    const nameInput = document.getElementById('catName');
    const iconInput = document.getElementById('catIcon');

    if (val === 'custom') {
        if (customInput) customInput.style.display = 'block';
        if (customInput) customInput.focus();
        if (hiddenKey) hiddenKey.value = customInput ? customInput.value.trim() : '';
    } else {
        if (customInput) customInput.style.display = 'none';
        if (hiddenKey) hiddenKey.value = val;

        if (select && select.selectedIndex >= 0 && val) {
            const selectedOpt = select.options[select.selectedIndex];
            const autoName = selectedOpt.getAttribute('data-name');
            const autoIcon = selectedOpt.getAttribute('data-icon');
            if (autoName && nameInput && (!nameInput.value || nameInput.getAttribute('data-autofilled') === 'true')) {
                nameInput.value = autoName;
                nameInput.setAttribute('data-autofilled', 'true');
            }
            if (autoIcon && iconInput) {
                iconInput.value = autoIcon;
            }
        }
    }
}

function syncCustomCatKey(val) {
    const hiddenKey = document.getElementById('catKey');
    if (hiddenKey) hiddenKey.value = val.trim().toLowerCase().replace(/\s+/g, '-');
}

function openAddCategoryForm() {
    const card = document.getElementById('categoryFormCard');
    if (!card) return;
    const form = document.getElementById('categoryAdminForm');
    if (form) form.reset();
    document.getElementById('catEditId').value = '';

    const select = document.getElementById('catKeySelect');
    const customInput = document.getElementById('catKeyCustom');
    const hiddenKey = document.getElementById('catKey');
    const nameInput = document.getElementById('catName');

    if (select) {
        select.value = '';
        select.disabled = false;
    }
    if (customInput) customInput.style.display = 'none';
    if (hiddenKey) hiddenKey.value = '';
    if (nameInput) nameInput.removeAttribute('data-autofilled');

    document.getElementById('categoryFormTitle').textContent = 'إضافة فئة جديدة (سكشن اختر فئتك المفضلة)';
    document.getElementById('catPreviewBox').style.display = 'none';
    const feedback = document.getElementById('catFeedback');
    if (feedback) feedback.textContent = '';
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth' });
}

function closeCategoryFormCard() {
    const card = document.getElementById('categoryFormCard');
    if (card) card.style.display = 'none';
}

function previewCatImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('catPreviewImg').src = e.target.result;
            document.getElementById('catPreviewBox').style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function editCategory(id) {
    const c = adminCategories.find(x => x.id === id);
    if (!c) return;
    openAddCategoryForm();
    document.getElementById('catEditId').value = c.id;

    const select = document.getElementById('catKeySelect');
    const customInput = document.getElementById('catKeyCustom');
    const hiddenKey = document.getElementById('catKey');

    if (hiddenKey) hiddenKey.value = c.key;

    const existsInSelect = select ? [...select.options].some(opt => opt.value === c.key) : false;
    if (existsInSelect && select) {
        select.value = c.key;
        if (customInput) customInput.style.display = 'none';
    } else {
        if (select) select.value = 'custom';
        if (customInput) {
            customInput.value = c.key;
            customInput.style.display = 'block';
        }
    }
    if (select) select.disabled = true;

    document.getElementById('catName').value = c.name;
    document.getElementById('catIcon').value = c.icon || 'fa-tag';
    document.getElementById('catImageUrl').value = c.image || '';
    if (c.image) {
        document.getElementById('catPreviewImg').src = c.image;
        document.getElementById('catPreviewBox').style.display = 'block';
    }
    document.getElementById('categoryFormTitle').textContent = `تعديل فئة: ${c.name}`;
}

async function handleCategoryFormSubmit(e) {
    e.preventDefault();
    const feedback = document.getElementById('catFeedback');
    if (feedback) feedback.textContent = 'جاري الحفظ...';

    const id = document.getElementById('catEditId').value;
    const key = document.getElementById('catKey').value.trim();
    const name = document.getElementById('catName').value.trim();
    const icon = document.getElementById('catIcon').value.trim();
    const imageUrl = document.getElementById('catImageUrl').value.trim();
    const fileInput = document.getElementById('catImageFile');

    const formData = new FormData();
    formData.append('key', key);
    formData.append('name', name);
    formData.append('icon', icon);
    if (imageUrl) formData.append('image', imageUrl);
    if (fileInput && fileInput.files[0]) {
        formData.append('categoryImageFile', fileInput.files[0]);
    }

    const url = id ? `${API_URL}/categories/${id}` : `${API_URL}/categories`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();

        if (res.ok) {
            if (feedback) {
                feedback.style.color = '#10B981';
                feedback.textContent = 'تم حفظ الفئة بنجاح!';
            }
            setTimeout(() => {
                closeCategoryFormCard();
                fetchCategoriesAdmin();
            }, 800);
        } else {
            if (feedback) {
                feedback.style.color = '#EF4444';
                feedback.textContent = data.error || 'فشل حفظ الفئة';
            }
        }
    } catch (err) {
        console.error('handleCategoryFormSubmit error:', err);
        if (feedback) {
            feedback.style.color = '#EF4444';
            feedback.textContent = 'حدث خطأ أثناء الاتصال بالسيرفر';
        }
    }
}

async function deleteCategory(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الفئة؟ سيتم حذفها أيضاً من سكشن الفئات في المتجر.')) return;
    try {
        const res = await fetch(`${API_URL}/categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            fetchCategoriesAdmin();
        } else {
            const data = await res.json();
            alert(data.error || 'فشل حذف الفئة');
        }
    } catch (err) {
        console.error(err);
    }
}


// ─── Theme Color Controls (Admin) ───────────────────────────────────────────
function selectThemePreset(hex) {
    updateThemeColorInput(hex);
    applyThemeColor(hex);
}

function updateThemeColorInput(hex) {
    if (!hex) return;
    const native = document.getElementById('themeColorNative');
    const text   = document.getElementById('themeColorHex');
    const prev   = document.getElementById('themeColorPreview');
    if (native) native.value = hex;
    if (text) text.value = hex.toUpperCase();
    if (prev) prev.style.background = hex;
    applyThemeColor(hex);
}

function applyThemeColor(color) {
    if (!color || typeof color !== 'string') return;
    const root = document.documentElement;
    root.style.setProperty('--color-gold', color);
    
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        root.style.setProperty('--color-gold-light', `rgba(${r}, ${g}, ${b}, 0.15)`);
        root.style.setProperty('--color-border-focus', `rgba(${r}, ${g}, ${b}, 0.5)`);
        root.style.setProperty('--shadow-gold', `0 4px 20px rgba(${r}, ${g}, ${b}, 0.15)`);
    }
}

async function saveThemeColorSettings() {
    let hex = document.getElementById('themeColorHex')?.value.trim();
    const feedback = document.getElementById('themeColorFeedback');
    if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) {
        hex = '#D4AF37';
    }
    const modeRadio = document.querySelector('input[name="themeModeRadio"]:checked');
    const themeMode = modeRadio ? modeRadio.value : 'dark';

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ theme_color: hex, theme_mode: themeMode })
        });
        if (res.ok) {
            if (feedback) {
                feedback.className = 'feedback-msg success';
                feedback.textContent = '✅ تم حفظ مظهر ونمط الألوان بنجاح!';
            }
            applyThemeColor(hex);
            localStorage.setItem('theme_mode', themeMode);
            applyThemeMode(themeMode);
        } else {
            const data = await res.json();
            if (feedback) {
                feedback.className = 'feedback-msg error';
                feedback.textContent = data.error || 'حدث خطأ أثناء الحفظ.';
            }
        }
    } catch (err) {
        console.error(err);
    }
}

function applyThemeMode(mode) {
    if (mode === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.setAttribute('data-theme', 'light');
        document.body.classList.add('light-mode');
    } else {
        document.documentElement.removeAttribute('data-theme');
        document.body.removeAttribute('data-theme');
        document.body.classList.remove('light-mode');
    }
}

function previewThemeMode(mode) {
    applyThemeMode(mode);
}


// ─── Hero Background Slider Controls (Admin) ─────────────────────────────────
async function uploadHeroImageFile(slideNum) {
    const fileInput = document.getElementById(`heroFile${slideNum}`);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('heroImage', fileInput.files[0]);

    try {
        const res = await fetch(`${API_URL}/upload-hero-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok && data.imageUrl) {
            document.getElementById(`heroImgUrl${slideNum}`).value = data.imageUrl;
            document.getElementById(`heroPreview${slideNum}`).src = data.imageUrl;
        } else {
            alert(data.error || 'فشل رفع صورة الهيرو');
        }
    } catch (err) {
        console.error(err);
        alert('خطأ في الاتصال بالخادم أثناء رفع الصورة.');
    }
}

async function saveHeroSliderSettings() {
    const feedback = document.getElementById('heroSliderFeedback');
    
    const slide1 = {
        image:       document.getElementById('heroImgUrl1')?.value.trim() || './assets/images/hero_slide_1.jpg',
        title:       document.getElementById('heroTitle1')?.value.trim() || '',
        subtitle:    document.getElementById('heroSubtitle1')?.value.trim() || '',
        description: document.getElementById('heroDesc1')?.value.trim() || ''
    };
    
    const slide2 = {
        image:       document.getElementById('heroImgUrl2')?.value.trim() || './assets/images/hero_slide_2.jpg',
        title:       document.getElementById('heroTitle2')?.value.trim() || '',
        subtitle:    document.getElementById('heroSubtitle2')?.value.trim() || '',
        description: document.getElementById('heroDesc2')?.value.trim() || ''
    };

    const hero_slides = JSON.stringify([slide1, slide2]);

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ hero_slides })
        });
        if (res.ok) {
            if (feedback) {
                feedback.className = 'feedback-msg success';
                feedback.textContent = '✅ تم حفظ صور وإعدادات الواجهة بنجاح!';
            }
        } else {
            const data = await res.json();
            if (feedback) {
                feedback.className = 'feedback-msg error';
                feedback.textContent = data.error || 'حدث خطأ أثناء الحفظ.';
            }
        }
    } catch (err) {
        console.error(err);
    }
}

// ─── Store Features (Quick Stats) Controls (Admin) ────────────────────────────
function addFeatureRow(title = '', desc = '', icon = 'fa-star') {
    const container = document.getElementById('featureRowsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'feature-admin-row';
    row.style.background = 'var(--color-bg-tertiary)';
    row.style.border = '1px solid var(--color-border)';
    row.style.borderRadius = 'var(--radius-md)';
    row.style.padding = '14px';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '10px';
    
    row.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            <select class="feature-icon-input form-control" style="flex:1 1 140px; min-width:130px; background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:8px 10px; color:#fff; border-radius:var(--radius-sm); font-size:0.85rem;">
                <option value="fa-truck-fast" ${icon === 'fa-truck-fast' ? 'selected' : ''}>🚚 fa-truck-fast (شحن)</option>
                <option value="fa-rotate-left" ${icon === 'fa-rotate-left' ? 'selected' : ''}>🔄 fa-rotate-left (استرجاع)</option>
                <option value="fa-shield-halved" ${icon === 'fa-shield-halved' ? 'selected' : ''}>🛡️ fa-shield-halved (جودة/ضمان)</option>
                <option value="fa-headset" ${icon === 'fa-headset' ? 'selected' : ''}>🎧 fa-headset (دعم فني)</option>
                <option value="fa-gem" ${icon === 'fa-gem' ? 'selected' : ''}>💎 fa-gem (فخامة/تميز)</option>
                <option value="fa-box" ${icon === 'fa-box' ? 'selected' : ''}>📦 fa-box (تغليف فاخر)</option>
                <option value="fa-hand-holding-dollar" ${icon === 'fa-hand-holding-dollar' ? 'selected' : ''}>💵 fa-hand-holding-dollar (دفع)</option>
                <option value="fa-star" ${icon === 'fa-star' ? 'selected' : ''}>⭐ fa-star (نجمة)</option>
            </select>
            <input type="text" class="feature-title-input form-control" style="flex:2 1 180px; min-width:150px; background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:8px 12px; color:#fff; border-radius:var(--radius-sm); font-size:0.88rem;" placeholder="العنوان الرئيسي (مثال: شحن سريع ومجاني)" value="${title.replace(/"/g, '&quot;')}">
            <button type="button" class="btn btn-outline" style="color:var(--color-danger); border-color:rgba(239,68,68,0.4); padding:8px 12px; border-radius:var(--radius-sm); flex-shrink:0;" onclick="this.parentElement.parentElement.remove()" title="حذف">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        <div>
            <input type="text" class="feature-desc-input form-control" style="width:100%; background:var(--color-bg-secondary); border:1px solid var(--color-border); padding:8px 12px; color:var(--color-text-secondary); border-radius:var(--radius-sm); font-size:0.88rem;" placeholder="الوصف (مثال: شحن خلال 24-48 ساعة لجميع المحافظات)" value="${desc.replace(/"/g, '&quot;')}">
        </div>
    `;
    container.appendChild(row);
}
window.addFeatureRow = addFeatureRow;

async function saveStoreFeaturesSettings() {
    const feedback = document.getElementById('featuresFeedback');
    const container = document.getElementById('featureRowsContainer');
    if (!container) return;

    const rows = container.querySelectorAll('.feature-admin-row');
    const featuresList = [];

    rows.forEach(r => {
        const icon = r.querySelector('.feature-icon-input')?.value || 'fa-star';
        const title = r.querySelector('.feature-title-input')?.value.trim();
        const desc = r.querySelector('.feature-desc-input')?.value.trim();
        if (title) {
            featuresList.push({ icon, title, desc: desc || '' });
        }
    });

    const store_features = JSON.stringify(featuresList);

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ store_features })
        });
        if (res.ok) {
            if (feedback) {
                feedback.className = 'feedback-msg success';
                feedback.textContent = '✅ تم حفظ مميزات المتجر بنجاح!';
            }
        } else {
            const data = await res.json();
            if (feedback) {
                feedback.className = 'feedback-msg error';
                feedback.textContent = data.error || 'حدث خطأ أثناء الحفظ.';
            }
        }
    } catch (err) {
        console.error(err);
    }
}
window.saveStoreFeaturesSettings = saveStoreFeaturesSettings;

// ─── Comments Management (Admin) ──────────────────────────────────────────
let adminCommentsList = [];

async function fetchCommentsAdmin() {
    try {
        const res = await fetch(`${API_URL}/admin/reviews`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.status === 401 || res.status === 403) {
            forceLogout();
            return;
        }
        const data = await res.json();
        adminCommentsList = Array.isArray(data) ? data : [];
        renderCommentsAdmin();
    } catch (err) {
        console.error('fetchCommentsAdmin error:', err);
    }

    try {
        const setRes = await fetch(`${API_URL}/settings`);
        if (setRes.ok) {
            const settings = await setRes.json();
            const toggle = document.getElementById('toggleCommentsVisibility');
            if (toggle) {
                toggle.checked = (settings.reviews_enabled !== 'false' && settings.reviews_enabled !== false);
            }
        }
    } catch (e) {}
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderCommentsAdmin() {
    const tbody = document.getElementById('adminCommentsTableBody');
    if (!tbody) return;

    if (adminCommentsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 25px; color: var(--color-text-muted);">لا توجد تعليقات حالياً.</td></tr>`;
        return;
    }

    tbody.innerHTML = adminCommentsList.map(c => {
        const stars = '⭐'.repeat(Math.round(c.rating || 5));
        return `
            <tr>
                <td><strong>${escapeHtml(c.name || 'عميل')}</strong></td>
                <td><span style="color:var(--color-gold); font-size:0.9rem;">${stars} (${c.rating})</span></td>
                <td style="max-width:350px; font-size:0.88rem; color:var(--color-text-secondary); line-height:1.5;">"${escapeHtml(c.comment)}"</td>
                <td><small style="color:var(--color-text-muted);">${escapeHtml(c.dateText || 'الآن')}</small></td>
                <td>
                    <button class="btn btn-outline" style="padding:6px 12px; font-size:0.82rem; color:var(--color-danger); border-color:rgba(239,68,68,0.3);" onclick="deleteCommentAdmin(${c.id})">
                        <i class="fa-solid fa-trash"></i> حذف التعليق
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteCommentAdmin(id) {
    if (!confirm('هل أنت متأكد من حذف هذا التعليق؟')) return;
    try {
        const res = await fetch(`${API_URL}/admin/reviews/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            fetchCommentsAdmin();
        } else {
            const data = await res.json();
            alert(data.error || 'فشل حذف التعليق');
        }
    } catch (err) {
        console.error(err);
        alert('خطأ في الاتصال بالخادم.');
    }
}
window.deleteCommentAdmin = deleteCommentAdmin;

async function saveCommentsVisibilitySettings() {
    const toggle = document.getElementById('toggleCommentsVisibility');
    const feedback = document.getElementById('commentsVisibilityFeedback');
    if (!toggle) return;

    const reviews_enabled = toggle.checked ? 'true' : 'false';

    if (feedback) {
        feedback.className = 'feedback-msg';
        feedback.style.color = 'var(--color-gold)';
        feedback.textContent = 'جاري الحفظ...';
    }

    try {
        const res = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ reviews_enabled })
        });
        if (res.ok) {
            if (feedback) {
                feedback.className = 'feedback-msg success';
                feedback.textContent = '✅ تم تحديث حالة إظهار التعليقات في المتجر!';
                setTimeout(() => { if (feedback) feedback.textContent = ''; }, 3000);
            }
        } else {
            const data = await res.json();
            if (feedback) {
                feedback.className = 'feedback-msg error';
                feedback.textContent = data.error || 'فشل الحفظ.';
            }
        }
    } catch (err) {
        console.error(err);
        if (feedback) {
            feedback.className = 'feedback-msg error';
            feedback.textContent = 'خطأ في الاتصال بالخادم.';
        }
    }
}
window.saveCommentsVisibilitySettings = saveCommentsVisibilitySettings;




