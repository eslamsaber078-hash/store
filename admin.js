const API_URL = window.location.origin + '/api';
let authToken = localStorage.getItem('adminToken') || null;

// --- DOM Elements ---
const loginScreen = document.getElementById('loginScreen');
const adminDashboard = document.getElementById('adminDashboard');
const loginForm = document.getElementById('adminLoginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

// Navigation
const navBtns = document.querySelectorAll('.admin-nav-btn');
const sections = document.querySelectorAll('.admin-section');

// Forms & Views
const paymentSettingsForm = document.getElementById('paymentSettingsForm');
const accountForm = document.getElementById('accountForm');
const productForm = document.getElementById('productForm');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
    } else {
        showLogin();
    }
    initColorWidgets();
});

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
    loginScreen.style.display = 'flex';
    adminDashboard.style.display = 'none';
}

function showDashboard() {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'flex';
    fetchOrders(); // Default view
    fetchSettings();
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
            showDashboard();
        } else {
            loginError.textContent = data.error || 'غير مصرح لك بالدخول';
        }
    } catch (err) {
        loginError.textContent = 'خطأ في الاتصال بالخادم';
    }
});

logoutBtn.addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('adminToken');
    showLogin();
});

// --- Navigation ---
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        sections.forEach(sec => sec.style.display = 'none');
        document.getElementById(btn.dataset.target).style.display = 'block';
        
        // Refresh data based on view
        if (btn.dataset.target === 'ordersView') fetchOrders();
        if (btn.dataset.target === 'productsView') fetchProductsAdmin();
        if (btn.dataset.target === 'settingsView') fetchSettings();
    });
});

// --- Account Management ---
accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('accUsername').value;
    const newPassword = document.getElementById('accPassword').value;
    
    try {
        const res = await fetch(`${API_URL}/auth/update`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ newUsername, newPassword: newPassword || undefined })
        });
        const data = await res.json();
        
        if (res.ok) {
            document.getElementById('accountFeedback').textContent = 'تم تحديث بيانات الدخول بنجاح. قد تحتاج لتسجيل الدخول مجدداً.';
            setTimeout(() => { logoutBtn.click(); }, 3000);
        } else {
            document.getElementById('accountFeedback').textContent = data.error || 'حدث خطأ';
            document.getElementById('accountFeedback').style.color = 'var(--color-danger)';
        }
    } catch (err) {
        console.error(err);
    }
});

// --- Settings Management ---
async function fetchSettings() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        const data = await res.json();
        if (data.bank_account) document.getElementById('setBank').value = data.bank_account;
        if (data.instapay) document.getElementById('setInstapay').value = data.instapay;
        if (data.ewallets) document.getElementById('setEwallets').value = data.ewallets;
        if (data.cash_on_delivery_enabled) document.getElementById('setCod').checked = (data.cash_on_delivery_enabled === 'true');
    } catch(err) { console.error(err); }
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
    tbody.innerHTML = '';
    
    if (adminOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">لا توجد طلبات بعد</td></tr>`;
        return;
    }
    
    adminOrders.forEach(o => {
        const date = new Date(o.created_at).toLocaleDateString('ar-EG');
        tbody.innerHTML += `
            <tr>
                <td><strong>${o.order_number}</strong></td>
                <td>${date}</td>
                <td>${o.customer_name}</td>
                <td class="text-gold font-bold">${o.total} ج.م</td>
                <td>${getPaymentMethodName(o.payment_method)}</td>
                <td>${getStatusBadge(o.status)}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-outline" style="padding: 5px 8px; font-size: 0.85rem;" onclick="viewOrder(${o.id})" title="عرض التفاصيل"><i class="fa-solid fa-eye"></i> عرض</button>
                        <button class="btn btn-secondary" style="padding: 5px 8px; font-size: 0.85rem; color: var(--color-danger); border-color: var(--color-danger);" onclick="deleteOrder(${o.id})" title="حذف الطلب"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
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
