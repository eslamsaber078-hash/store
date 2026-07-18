/* ==========================================================================
   DA VINCI STORE - MAIN INTERACTIVE STATE CONTROLLER
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // --- STATE VARIABLES ---
  let products = [];
  let userToken = localStorage.getItem("userToken") || null;
  let cart = JSON.parse(localStorage.getItem("davinci_store_cart")) || [];
  let wishlist = JSON.parse(localStorage.getItem("davinci_store_wishlist")) || [];
  let currentFilter = {
    category: "all",
    searchQuery: "",
    maxPrice: 15000,
    inStockOnly: true,
    featuredOnly: false,
    sortBy: "featured"
  };
  let currentPromo = null; // Stores promo discount details
  let paymentSettings = {}; // Stores payment configuration from server
  let activeSlide = 0;
  let slideInterval = null;

  // Selected specs for Quick View
  let qvSelectedProduct = null;
  let qvSelectedSize = null;
  let qvSelectedColor = null;

  // --- DOM ELEMENTS CACHE ---
  const elements = {
    // Header & Navigation
    navLinks: document.querySelectorAll(".nav-link"),
    mobileNavLinks: document.querySelectorAll(".mobile-nav-link"),
    searchInput: document.getElementById("searchInput"),
    searchBtn: document.getElementById("searchBtn"),
    mobileMenuBtn: document.getElementById("mobileMenuBtn"),
    mobileDrawer: document.getElementById("mobileDrawer"),
    closeMobileDrawer: document.getElementById("closeMobileDrawer"),
    drawerOverlay: document.getElementById("drawerOverlay"),
    wishlistCount: document.getElementById("wishlistCount"),
    wishlistToggleBtn: document.getElementById("wishlistToggleBtn"),
    wishlistDrawer: document.getElementById("wishlistDrawer"),
    closeWishlistBtn: document.getElementById("closeWishlistBtn"),
    wishlistEmptyState: document.getElementById("wishlistEmptyState"),
    wishlistFilledState: document.getElementById("wishlistFilledState"),
    wishlistItemsList: document.getElementById("wishlistItemsList"),
    wishlistCountTitle: document.getElementById("wishlistCountTitle"),
    wishlistStartShoppingBtn: document.getElementById("wishlistStartShoppingBtn"),
    cartCount: document.getElementById("cartCount"),
    cartToggleBtn: document.getElementById("cartToggleBtn"),

    // Hero Slider
    slides: document.querySelectorAll(".slide"),
    dots: document.querySelectorAll(".dot"),
    sliderDotsContainer: document.getElementById("sliderDots"),

    // Categories preview
    catCards: document.querySelectorAll(".category-card"),

    // Shop Grid & Controls
    productsGrid: document.getElementById("productsGrid"),
    noProductsFound: document.getElementById("noProductsFound"),
    currentCategoryTitle: document.getElementById("currentCategoryTitle"),
    productsCountText: document.getElementById("productsCountText"),
    sortBySelect: document.getElementById("sortBySelect"),
    mobileFilterToggleBtn: document.getElementById("mobileFilterToggleBtn"),
    filterSidebar: document.getElementById("filterSidebar"),
    closeFilterSidebar: document.getElementById("closeFilterSidebar"),

    // Sidebar Filters
    sidebarSearchInput: document.getElementById("sidebarSearchInput"),
    catFilterBtns: document.querySelectorAll(".cat-filter-btn"),
    priceRangeSlider: document.getElementById("priceRangeSlider"),
    priceMinVal: document.getElementById("priceMinVal"),
    priceMaxVal: document.getElementById("priceMaxVal"),
    inStockCheckbox: document.getElementById("inStockCheckbox"),
    featuredCheckbox: document.getElementById("featuredCheckbox"),
    resetFiltersBtn: document.getElementById("resetFiltersBtn"),
    resetFiltersBtnEmpty: document.getElementById("resetFiltersBtnEmpty"),

    // Side Cart Drawer
    cartDrawer: document.getElementById("cartDrawer"),
    closeCartBtn: document.getElementById("closeCartBtn"),
    cartEmptyState: document.getElementById("cartEmptyState"),
    cartFilledState: document.getElementById("cartFilledState"),
    cartItemsList: document.getElementById("cartItemsList"),
    cartCountTitle: document.getElementById("cartCountTitle"),
    promoInput: document.getElementById("promoInput"),
    applyPromoBtn: document.getElementById("applyPromoBtn"),
    promoFeedbackMsg: document.getElementById("promoFeedbackMsg"),
    cartSubtotal: document.getElementById("cartSubtotal"),
    discountRow: document.getElementById("discountRow"),
    cartDiscount: document.getElementById("cartDiscount"),
    cartTotal: document.getElementById("cartTotal"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    startShoppingBtn: document.getElementById("startShoppingBtn"),

    // Quick View Modal
    quickViewModal: document.getElementById("quickViewModal"),
    closeQuickViewBtn: document.getElementById("closeQuickViewBtn"),
    quickViewBackdrop: document.getElementById("quickViewBackdrop"),
    qvMainImage: document.getElementById("qvMainImage"),
    qvDiscountBadge: document.getElementById("qvDiscountBadge"),
    qvCategory: document.getElementById("qvCategory"),
    qvName: document.getElementById("qvName"),
    qvStars: document.getElementById("qvStars"),
    qvReviewsText: document.getElementById("qvReviewsText"),
    qvPrice: document.getElementById("qvPrice"),
    qvOldPrice: document.getElementById("qvOldPrice"),
    qvDescription: document.getElementById("qvDescription"),
    qvSelectedColorText: document.getElementById("qvSelectedColorText"),
    qvColorsContainer: document.getElementById("qvColorsContainer"),
    qvSelectedSizeText: document.getElementById("qvSelectedSizeText"),
    qvSizesContainer: document.getElementById("qvSizesContainer"),
    qvQtyMinus: document.getElementById("qvQtyMinus"),
    qvQtyPlus: document.getElementById("qvQtyPlus"),
    qvQtyVal: document.getElementById("qvQtyVal"),
    qvAddToCartBtn: document.getElementById("qvAddToCartBtn"),

    // Checkout Modal (Wizard)
    checkoutModal: document.getElementById("checkoutModal"),
    closeCheckoutBtn: document.getElementById("closeCheckoutBtn"),
    checkoutBackdrop: document.getElementById("checkoutBackdrop"),
    checkoutForm: document.getElementById("checkoutForm"),
    checkoutStep1: document.getElementById("checkoutStep1"),
    checkoutStep2: document.getElementById("checkoutStep2"),
    checkoutStep3: document.getElementById("checkoutStep3"),
    stepIndicator1: document.getElementById("stepIndicator1"),
    stepIndicator2: document.getElementById("stepIndicator2"),
    stepIndicator3: document.getElementById("stepIndicator3"),
    stepLine1: document.getElementById("stepLine1"),
    stepLine2: document.getElementById("stepLine2"),
    
    // Step navigation buttons
    coNextStep1: document.getElementById("coNextStep1"),
    coPrevStep2: document.getElementById("coPrevStep2"),
    coNextStep2: document.getElementById("coNextStep2"),
    coPrevStep3: document.getElementById("coPrevStep3"),
    coSubmitOrderBtn: document.getElementById("coSubmitOrderBtn"),

    // Step 2 payment inputs
    paymentCardForm: document.getElementById("cardDetailsForm"),
    paymentMethods: document.getElementsByName("paymentMethod"),

    // Step 3 final summary fields
    summaryAddressText: document.getElementById("summaryAddressText"),
    summaryPaymentText: document.getElementById("summaryPaymentText"),
    coSubtotal: document.getElementById("coSubtotal"),
    coDiscountRow: document.getElementById("coDiscountRow"),
    coDiscount: document.getElementById("coDiscount"),
    coTotal: document.getElementById("coTotal"),

    // Success Modal
    successModal: document.getElementById("successModal"),
    coSuccessOrderNum: document.getElementById("coSuccessOrderNum"),
    closeSuccessBtn: document.getElementById("closeSuccessBtn"),
    confettiContainer: document.getElementById("confettiContainer"),

    // Payment Gate Modal
    paymentGateModal: document.getElementById("paymentGateModal"),
    closePaymentGateBtn: document.getElementById("closePaymentGateBtn"),
    paymentGateBackdrop: document.getElementById("paymentGateBackdrop"),
    paymentGateDynamicContainer: document.getElementById("paymentGateDynamicContainer"),

    // Newsletter
    newsletterForm: document.getElementById("newsletterForm"),
    newsletterEmail: document.getElementById("newsletterEmail"),
    newsletterMessage: document.getElementById("newsletterMessage")
  };

  // --- WIDGET & UI INITIALIZATIONS ---
  const API_BASE = window.location.origin + '/api';
  initApp();

  async function initApp() {
    try {
        const prodRes = await fetch(`${API_BASE}/products`);
        if (!prodRes.ok) throw new Error(`HTTP ${prodRes.status}`);
        const apiProducts = await prodRes.json();
        if (Array.isArray(apiProducts) && apiProducts.length > 0) {
            products = apiProducts;
        } else {
            throw new Error('Empty products response');
        }
    } catch(err) {
        console.warn("API unavailable, using local products.js data:", err.message);
        // Fallback to static products.js if it's loaded
        if (typeof window !== 'undefined' && window.products && Array.isArray(window.products)) {
            products = window.products;
        } else if (typeof products !== 'undefined' && Array.isArray(products)) {
            // products is the global from products.js
        }
        // keep products = [] if all else fails
    }

    try {
        const setRes = await fetch(`${API_BASE}/settings`);
        const settings = await setRes.json();
        paymentSettings = settings;
        setupDynamicPaymentMethods(settings);
    } catch(err) {
        console.error("Failed to load settings from server", err);
    }

    renderProducts();
    updateCartUI();
    updateWishlistUI();
    updateCategoryCounts();
    startHeroSlider();
    registerEventListeners();
    updateAuthStateUI();
    initGoogleSignIn();
  }

  function setupDynamicPaymentMethods(settings) {
    const paymentContainer = document.getElementById("checkoutStep2");
    if (!paymentContainer) return;
    
    const methodsDiv = paymentContainer.querySelector('.payment-options-grid');
    if (methodsDiv) {
        let html = '';

        // Cash on delivery - Enabled and Checked by default
        html += `
        <label class="payment-option-card">
          <input type="radio" name="paymentMethod" value="cod" checked>
          <span class="payment-card-inner">
            <span class="payment-icon"><i class="fa-solid fa-hand-holding-dollar"></i></span>
            <span class="payment-name">الدفع عند الاستلام</span>
            <span class="payment-desc">الدفع للمندوب عند استلام شحنتك الفاخرة.</span>
          </span>
        </label>`;

        // Bank Account - Disabled
        if (settings.bank_account) {
            html += `
            <label class="payment-option-card disabled" style="opacity: 0.55; cursor: not-allowed; pointer-events: none;">
              <input type="radio" name="paymentMethod" value="bank" disabled>
              <span class="payment-card-inner">
                <span class="payment-icon"><i class="fa-solid fa-building-columns"></i></span>
                <span class="payment-name">تحويل بنكي مباشر</span>
                <span class="payment-desc">رقم الحساب: ${settings.bank_account}</span>
                <span style="font-size: 0.65rem; background-color: rgba(212, 175, 55, 0.15); color: var(--color-gold); padding: 3px 8px; border-radius: 4px; font-weight: 700; margin-top: 8px; display: inline-block; width: fit-content;">غير متوفر حالياً</span>
              </span>
            </label>`;
        }

        // InstaPay - Disabled
        if (settings.instapay) {
            html += `
            <label class="payment-option-card disabled" style="opacity: 0.55; cursor: not-allowed; pointer-events: none;">
              <input type="radio" name="paymentMethod" value="instapay" disabled>
              <span class="payment-card-inner">
                <span class="payment-icon"><i class="fa-solid fa-bolt"></i></span>
                <span class="payment-name">انستا باي (InstaPay)</span>
                <span class="payment-desc">تحويل سريع عبر: ${settings.instapay}</span>
                <span style="font-size: 0.65rem; background-color: rgba(212, 175, 55, 0.15); color: var(--color-gold); padding: 3px 8px; border-radius: 4px; font-weight: 700; margin-top: 8px; display: inline-block; width: fit-content;">غير متوفر حالياً</span>
              </span>
            </label>`;
        }

        // Mobile Wallets - Disabled
        if (settings.ewallets) {
            html += `
            <label class="payment-option-card disabled" style="opacity: 0.55; cursor: not-allowed; pointer-events: none;">
              <input type="radio" name="paymentMethod" value="ewallet" disabled>
              <span class="payment-card-inner">
                <span class="payment-icon"><i class="fa-solid fa-mobile-screen-button"></i></span>
                <span class="payment-name">محافظ إلكترونية</span>
                <span class="payment-desc">${settings.ewallets}</span>
                <span style="font-size: 0.65rem; background-color: rgba(212, 175, 55, 0.15); color: var(--color-gold); padding: 3px 8px; border-radius: 4px; font-weight: 700; margin-top: 8px; display: inline-block; width: fit-content;">غير متوفر حالياً</span>
              </span>
            </label>`;
        }

        // Credit Card - Disabled
        html += `
        <label class="payment-option-card disabled" style="opacity: 0.55; cursor: not-allowed; pointer-events: none;">
          <input type="radio" name="paymentMethod" value="card" disabled>
          <span class="payment-card-inner">
            <span class="payment-icon"><i class="fa-regular fa-credit-card"></i></span>
            <span class="payment-name">البطاقة الائتمانية والخصم</span>
            <span class="payment-desc">فيزا، ماستركارد، أو ميزة. دفع آمن ومشفر 100%.</span>
            <span style="font-size: 0.65rem; background-color: rgba(212, 175, 55, 0.15); color: var(--color-gold); padding: 3px 8px; border-radius: 4px; font-weight: 700; margin-top: 8px; display: inline-block; width: fit-content;">غير متوفر حالياً</span>
          </span>
        </label>`;

        methodsDiv.innerHTML = html;
        
        // Re-bind elements to the new inputs
        elements.paymentMethods = document.getElementsByName("paymentMethod");

        // Re-bind change listeners for toggling credit card inputs
        elements.paymentMethods.forEach(method => {
          method.addEventListener("change", (e) => {
            if (e.target.value === "card") {
              elements.paymentCardForm.style.display = "block";
            } else {
              elements.paymentCardForm.style.display = "none";
            }
          });
        });
        
        // Trigger check state update on initial load
        const checkedMethod = Array.from(elements.paymentMethods).find(m => m.checked);
        if (checkedMethod && checkedMethod.value === "card") {
          elements.paymentCardForm.style.display = "block";
        } else {
          elements.paymentCardForm.style.display = "none";
        }
    }
  }

  // --- HERO SLIDER FUNCTIONALITY ---
  function startHeroSlider() {
    stopHeroSlider();
    slideInterval = setInterval(() => {
      nextSlide();
    }, 6000);
  }

  function stopHeroSlider() {
    if (slideInterval) clearInterval(slideInterval);
  }

  function nextSlide() {
    activeSlide = (activeSlide + 1) % elements.slides.length;
    showSlide(activeSlide);
  }

  function showSlide(index) {
    elements.slides.forEach(slide => slide.classList.remove("active"));
    elements.dots.forEach(dot => dot.classList.remove("active"));
    
    elements.slides[index].classList.add("active");
    elements.dots[index].classList.add("active");
    activeSlide = index;
  }

  // --- PRODUCTS RENDERING & FILTERING ---
  function renderProducts() {
    let filteredList = [...products];

    // Filter by category
    if (currentFilter.category !== "all") {
      filteredList = filteredList.filter(p => p.category === currentFilter.category);
    }

    // Filter by search query
    if (currentFilter.searchQuery.trim() !== "") {
      const query = currentFilter.searchQuery.toLowerCase().trim();
      filteredList = filteredList.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.description.toLowerCase().includes(query) ||
        p.categoryName.toLowerCase().includes(query)
      );
    }

    // Filter by max price
    filteredList = filteredList.filter(p => p.price <= currentFilter.maxPrice);

    // Filter by stock status
    if (currentFilter.inStockOnly) {
      filteredList = filteredList.filter(p => p.inStock);
    }

    // Filter by featured status
    if (currentFilter.featuredOnly) {
      filteredList = filteredList.filter(p => p.featured);
    }

    // Sort products list
    if (currentFilter.sortBy === "price-asc") {
      filteredList.sort((a, b) => a.price - b.price);
    } else if (currentFilter.sortBy === "price-desc") {
      filteredList.sort((a, b) => b.price - a.price);
    } else if (currentFilter.sortBy === "rating") {
      filteredList.sort((a, b) => b.rating - a.rating);
    } else {
      // featured
      filteredList.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    // Update Counts & Titles
    elements.productsCountText.innerText = `نعرض لكم ${filteredList.length} من أصل ${products.length} منتجاً فاخراً`;
    
    const catTitles = {
      all: "كل المنتجات الفاخرة",
      clothing: "الملابس الإيطالية الراقية",
      shoes: "أفخم الأحذية المصنوعة يدوياً",
      pants: "بناطيل وتصميمات عصرية",
      accessories: "ساعات وإكسسوارات النخبة"
    };
    elements.currentCategoryTitle.innerText = catTitles[currentFilter.category] || "المنتجات الفاخرة";

    // Handle Empty State
    if (filteredList.length === 0) {
      elements.productsGrid.style.display = "none";
      elements.noProductsFound.style.display = "block";
      return;
    }

    elements.productsGrid.style.display = "grid";
    elements.noProductsFound.style.display = "none";

    // Draw grid items HTML
    elements.productsGrid.innerHTML = filteredList.map(product => {
      const discountPercentage = product.oldPrice 
        ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) 
        : 0;

      const isWishlisted = wishlist.includes(product.id);

      return `
        <article class="product-card" data-id="${product.id}">
          ${discountPercentage > 0 ? `<span class="product-badge discount">خصم ${discountPercentage}%</span>` : (product.featured ? `<span class="product-badge featured">متميز</span>` : "")}
          
          <button class="wishlist-btn-card ${isWishlisted ? "active" : ""}" aria-label="أضف للمفضلة" onclick="window.vogueToggleWishlist('${product.id}')">
            <i class="${isWishlisted ? "fa-solid" : "fa-regular"} fa-heart"></i>
          </button>
          
          <div class="product-card-image">
            <img src="${product.image}" alt="${product.name}">
            <div class="quick-view-overlay">
              <button class="btn-quickview" onclick="window.vogueOpenQuickView('${product.id}')">
                <i class="fa-solid fa-eye"></i> عرض سريع
              </button>
            </div>
          </div>
          
          <div class="product-card-details">
            <span class="product-card-cat">${product.categoryName}</span>
            <h3 class="product-card-name">${product.name}</h3>
            
            <div class="product-card-rating">
              <div class="stars">
                ${generateStarsHTML(product.rating)}
              </div>
              <span>(${product.reviewsCount})</span>
            </div>
            
            <div class="product-card-footer">
              <div class="product-card-price">
                <span class="price-current">${formatPrice(product.price)}</span>
                ${product.oldPrice ? `<span class="price-old">${formatPrice(product.oldPrice)}</span>` : ""}
              </div>
              <button class="btn-buy-card" onclick="window.vogueQuickAddToCart('${product.id}')" aria-label="أضف للسلة">
                <i class="fa-solid fa-cart-plus"></i>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function generateStarsHTML(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    let html = "";
    
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        html += `<i class="fa-solid fa-star"></i>`;
      } else if (i === fullStars + 1 && halfStar) {
        html += `<i class="fa-solid fa-star-half-stroke"></i>`;
      } else {
        html += `<i class="fa-regular fa-star"></i>`;
      }
    }
    return html;
  }

  function updateCategoryCounts() {
    const counts = {
      all: products.length,
      clothing: products.filter(p => p.category === "clothing").length,
      shoes: products.filter(p => p.category === "shoes").length,
      pants: products.filter(p => p.category === "pants").length,
      accessories: products.filter(p => p.category === "accessories").length
    };

    for (const key in counts) {
      const el = document.getElementById(`count-${key}`);
      if (el) el.innerText = counts[key];
    }
  }

  function formatPrice(number) {
    return `${number.toLocaleString("ar-EG")} ج.م`;
  }

  // --- CART OPERATIONS ---
  function updateCartUI() {
    localStorage.setItem("davinci_store_cart", JSON.stringify(cart));
    
    // Updates count badges
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    elements.cartCount.innerText = totalQty;
    elements.cartCountTitle.innerText = `${totalQty} قطعة`;

    // Toggle Empty state vs Filled state
    if (cart.length === 0) {
      elements.cartEmptyState.style.display = "flex";
      elements.cartFilledState.style.display = "none";
      return;
    }

    elements.cartEmptyState.style.display = "none";
    elements.cartFilledState.style.display = "flex";

    // Draw cart items list
    elements.cartItemsList.innerHTML = cart.map((item, index) => {
      const prod = products.find(p => Number(p.id) === Number(item.productId));
      if (!prod) return "";

      return `
        <div class="cart-item">
          <img src="${prod.image}" alt="${prod.name}" class="cart-item-img">
          <div class="cart-item-details">
            <h4 class="cart-item-name">${prod.name}</h4>
            <div class="cart-item-meta">
              <span>المقاس: ${item.size || 'N/A'}</span> | <span>اللون: ${item.color && item.color.name ? item.color.name : 'افتراضي'}</span>
            </div>
            <div class="cart-item-controls">
              <div class="cart-qty-selector">
                <button class="cart-qty-btn" onclick="window.vogueUpdateCartQty(${index}, -1)" aria-label="تقليل الكمية"><i class="fa-solid fa-minus"></i></button>
                <span class="cart-qty-val">${item.quantity}</span>
                <button class="cart-qty-btn" onclick="window.vogueUpdateCartQty(${index}, 1)" aria-label="زيادة الكمية"><i class="fa-solid fa-plus"></i></button>
              </div>
              <span class="cart-item-price">${formatPrice(prod.price * item.quantity)}</span>
            </div>
          </div>
          <button class="cart-item-remove" onclick="window.vogueRemoveFromCart(${index})" aria-label="حذف المنتج"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      `;
    }).join("");

    calculateCartTotals();
  }

  function calculateCartTotals() {
    const subtotal = cart.reduce((sum, item) => {
      const prod = products.find(p => Number(p.id) === Number(item.productId));
      return sum + (prod ? prod.price * item.quantity : 0);
    }, 0);

    elements.cartSubtotal.innerText = formatPrice(subtotal);

    let discount = 0;
    if (currentPromo) {
      if (currentPromo.type === "percentage") {
        discount = Math.round(subtotal * currentPromo.value);
      }
    }

    if (discount > 0) {
      elements.discountRow.style.display = "flex";
      elements.cartDiscount.innerText = `-${formatPrice(discount)}`;
    } else {
      elements.discountRow.style.display = "none";
    }

    const total = Math.max(0, subtotal - discount);
    elements.cartTotal.innerText = formatPrice(total);

    // Sync values with checkout step 3 if checkout modal is populated
    elements.coSubtotal.innerText = formatPrice(subtotal);
    if (discount > 0) {
      elements.coDiscountRow.style.display = "flex";
      elements.coDiscount.innerText = `-${formatPrice(discount)}`;
    } else {
      elements.coDiscountRow.style.display = "none";
    }
    elements.coTotal.innerText = formatPrice(total);
  }

  window.vogueUpdateCartQty = (index, delta) => {
    cart[index].quantity = Math.max(1, Math.min(10, cart[index].quantity + delta));
    updateCartUI();
  };

  window.vogueRemoveFromCart = (index) => {
    cart.splice(index, 1);
    updateCartUI();
  };

  window.vogueQuickAddToCart = (productId) => {
    productId = Number(productId);
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    // Pick first size and first color as default for quick-buy
    const size = prod.sizes && prod.sizes.length > 0 ? prod.sizes[0] : 'N/A';
    const color = prod.colors && prod.colors.length > 0 ? prod.colors[0] : { name: 'افتراضي', code: '#888888', secondary: '#888888' };

    addToCart(productId, size, color, 1);
    
    // Open cart drawer immediately to show additions
    elements.cartDrawer.classList.add("active");
    elements.drawerOverlay.classList.add("active");
  };

  function addToCart(productId, size, color, quantity) {
    productId = Number(productId);
    // Check if item already exists in cart with same color and size
    const existingIndex = cart.findIndex(item => 
      Number(item.productId) === productId && 
      item.size === size && 
      (item.color && color ? item.color.name === color.name : item.color === color)
    );

    if (existingIndex > -1) {
      cart[existingIndex].quantity = Math.min(10, cart[existingIndex].quantity + quantity);
    } else {
      cart.push({
        productId,
        size,
        color: color || { name: 'افتراضي', code: '#888888', secondary: '#888888' },
        quantity
      });
    }
    updateCartUI();
  }

  // --- WISHLIST OPERATIONS ---
  function updateWishlistUI() {
    // Ensure all wishlist entries are stored as Numbers and exist in the products list
    wishlist = wishlist.map(Number).filter(id => !isNaN(id) && products.some(p => Number(p.id) === id));
    localStorage.setItem("davinci_store_wishlist", JSON.stringify(wishlist));
    
    // Update count badges
    elements.wishlistCount.innerText = wishlist.length;
    elements.wishlistCountTitle.innerText = `${wishlist.length} قطعة`;

    // Toggle Empty state vs Filled state
    if (wishlist.length === 0) {
      elements.wishlistEmptyState.style.display = "flex";
      elements.wishlistFilledState.style.display = "none";
      return;
    }

    elements.wishlistEmptyState.style.display = "none";
    elements.wishlistFilledState.style.display = "flex";

    // Draw wishlist items list
    elements.wishlistItemsList.innerHTML = wishlist.map((id) => {
      const prod = products.find(p => Number(p.id) === Number(id));
      if (!prod) return "";

      return `
        <div class="cart-item">
          <img src="${prod.image}" alt="${prod.name}" class="cart-item-img">
          <div class="cart-item-details">
            <h4 class="cart-item-name">${prod.name}</h4>
            <span class="cart-item-price">${formatPrice(prod.price)}</span>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
              <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.75rem; border-radius: var(--radius-sm);" onclick="window.vogueQuickAddToCart(${prod.id}); elements.wishlistDrawer.classList.remove('active'); elements.drawerOverlay.classList.remove('active');">
                <i class="fa-solid fa-cart-plus"></i> شراء سريع
              </button>
              <button class="btn btn-outline" style="padding: 6px 10px; font-size: 0.75rem; border-radius: var(--radius-sm); color: var(--color-danger); border-color: var(--color-danger);" onclick="window.vogueToggleWishlist(${prod.id})">
                <i class="fa-solid fa-trash-can"></i> إزالة
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.vogueToggleWishlist = (productId) => {
    productId = Number(productId);
    const index = wishlist.indexOf(productId);
    if (index > -1) {
      wishlist.splice(index, 1);
    } else {
      wishlist.push(productId);
    }
    updateWishlistUI();
    renderProducts(); // Refresh grids for heart icon states
  };

  // --- QUICK VIEW ACTIONS ---
  window.vogueOpenQuickView = (productId) => {
    productId = Number(productId);
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    qvSelectedProduct = prod;
    qvSelectedSize = prod.sizes && prod.sizes.length > 0 ? prod.sizes[0] : null;
    qvSelectedColor = prod.colors && prod.colors.length > 0 ? prod.colors[0] : null;

    // Set text values
    elements.qvCategory.innerText = prod.categoryName;
    elements.qvName.innerText = prod.name;
    
    // Build images array (use images[] first, fallback to image)
    const allImages = (prod.images && prod.images.length > 0) ? prod.images : (prod.image ? [prod.image] : []);
    elements.qvMainImage.src = allImages[0] || '';
    elements.qvMainImage.alt = prod.name;
    elements.qvDescription.innerText = prod.description;

    // Render thumbnails
    const thumbsContainer = document.getElementById('qvThumbnails');
    if (allImages.length > 1) {
      thumbsContainer.style.display = 'flex';
      thumbsContainer.innerHTML = allImages.map((img, i) => `
        <img src="${img}" alt="${prod.name} - صورة ${i+1}"
             class="qv-thumb ${i === 0 ? 'active' : ''}"
             onclick="document.getElementById('qvMainImage').src='${img}';document.querySelectorAll('.qv-thumb').forEach(t=>t.classList.remove('active'));this.classList.add('active');"
        >
      `).join('');
    } else {
      thumbsContainer.style.display = 'none';
      thumbsContainer.innerHTML = '';
    }
    
    // Rating
    elements.qvStars.innerHTML = generateStarsHTML(prod.rating);
    elements.qvReviewsText.innerText = `(${prod.reviewsCount} تقييم من العملاء النخبة)`;

    // Price details
    elements.qvPrice.innerText = formatPrice(prod.price);
    if (prod.oldPrice) {
      elements.qvOldPrice.style.display = "inline";
      elements.qvOldPrice.innerText = formatPrice(prod.oldPrice);
      
      const discountPercentage = Math.round(((prod.oldPrice - prod.price) / prod.oldPrice) * 100);
      elements.qvDiscountBadge.style.display = "block";
      elements.qvDiscountBadge.innerText = `خصم ${discountPercentage}%`;
    } else {
      elements.qvOldPrice.style.display = "none";
      elements.qvDiscountBadge.style.display = "none";
    }

    // Color Swatches
    if (prod.colors && prod.colors.length > 0) {
      elements.qvColorsContainer.innerHTML = prod.colors.map(color => {
        return `
          <button class="color-swatch-btn ${qvSelectedColor && color.name === qvSelectedColor.name ? 'active' : ''}" 
                  style="--swatch-color: ${color.code}" 
                  data-color-name="${color.name}"
                  aria-label="${color.name}">
          </button>
        `;
      }).join("");
      elements.qvSelectedColorText.innerText = qvSelectedColor ? qvSelectedColor.name : '';
    } else {
      elements.qvColorsContainer.innerHTML = '<span style="color:var(--color-text-muted);font-size:0.85rem;">لا توجد ألوان</span>';
      elements.qvSelectedColorText.innerText = '';
    }

    // Size Swatches
    if (prod.sizes && prod.sizes.length > 0) {
      elements.qvSizesContainer.innerHTML = prod.sizes.map(size => {
        return `
          <button class="size-swatch-btn ${size === qvSelectedSize ? 'active' : ''}" 
                  data-size="${size}">
            ${size}
          </button>
        `;
      }).join("");
      elements.qvSelectedSizeText.innerText = qvSelectedSize || '';
    } else {
      elements.qvSizesContainer.innerHTML = '<span style="color:var(--color-text-muted);font-size:0.85rem;">مقاس واحد</span>';
      elements.qvSelectedSizeText.innerText = 'مقاس واحد';
    }
    elements.qvQtyVal.value = 1;

    // Add color click events (only if colors exist)
    const colorBtns = elements.qvColorsContainer.querySelectorAll(".color-swatch-btn");
    colorBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        colorBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        const colorName = btn.getAttribute("data-color-name");
        const found = prod.colors.find(c => c.name === colorName);
        if (found) {
          qvSelectedColor = found;
          elements.qvSelectedColorText.innerText = qvSelectedColor.name;
        }
      });
    });

    // Add size click events (only if sizes exist)
    const sizeBtns = elements.qvSizesContainer.querySelectorAll(".size-swatch-btn");
    sizeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        sizeBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        qvSelectedSize = btn.getAttribute("data-size");
        // Convert string sizes to numbers if appropriate
        if (!isNaN(qvSelectedSize)) {
          qvSelectedSize = Number(qvSelectedSize);
        }
        elements.qvSelectedSizeText.innerText = qvSelectedSize;
      });
    });

    // Show modal
    elements.quickViewModal.classList.add("active");
    document.body.style.overflow = "hidden"; // disable body scrolling
  };

  function closeQuickView() {
    elements.quickViewModal.classList.remove("active");
    document.body.style.overflow = "auto";
  }

  // --- CHECKOUT WIZARD PROCESS ---
  let currentCheckoutStep = 1;

  function showCheckoutStep(step) {
    currentCheckoutStep = step;
    
    // Manage step classes visibility
    elements.checkoutStep1.classList.remove("active");
    elements.checkoutStep2.classList.remove("active");
    elements.checkoutStep3.classList.remove("active");

    elements.stepIndicator1.classList.remove("active", "completed");
    elements.stepIndicator2.classList.remove("active", "completed");
    elements.stepIndicator3.classList.remove("active", "completed");

    elements.stepLine1.classList.remove("active", "completed");
    elements.stepLine2.classList.remove("active", "completed");

    document.getElementById(`checkoutStep${step}`).classList.add("active");

    // Stepper indicators state logic
    if (step === 1) {
      elements.stepIndicator1.classList.add("active");
    } else if (step === 2) {
      elements.stepIndicator1.classList.add("completed");
      elements.stepLine1.classList.add("active");
      elements.stepIndicator2.classList.add("active");
    } else if (step === 3) {
      elements.stepIndicator1.classList.add("completed");
      elements.stepLine1.classList.add("completed");
      elements.stepIndicator2.classList.add("completed");
      elements.stepLine2.classList.add("active");
      elements.stepIndicator3.classList.add("active");
    }
  }

  function validateStep1() {
    const fn = document.getElementById("coFirstName");
    const ln = document.getElementById("coLastName");
    const ph = document.getElementById("coPhone");
    const ad = document.getElementById("coAddress");
    const gov = document.getElementById("coGovernorate");
    const city = document.getElementById("coCity");

    if (!fn.checkValidity() || !ln.checkValidity() || !ph.checkValidity() || !ad.checkValidity() || !gov.checkValidity() || !city.checkValidity()) {
      fn.reportValidity() || ln.reportValidity() || ph.reportValidity() || ad.reportValidity() || gov.reportValidity() || city.reportValidity();
      return false;
    }
    return true;
  }

  function updateCheckoutSummary() {
    // Collect inputs
    const fn = document.getElementById("coFirstName").value;
    const ln = document.getElementById("coLastName").value;
    const ph = document.getElementById("coPhone").value;
    const ad = document.getElementById("coAddress").value;
    const gov = document.getElementById("coGovernorate").value;
    const city = document.getElementById("coCity").value;

    elements.summaryAddressText.innerText = `${fn} ${ln} - ${ph}، ${ad}، ${city}، ${gov}`;

    // Get selected payment option
    let selectedMethod = "cod";
    elements.paymentMethods.forEach(method => {
      if (method.checked) selectedMethod = method.value;
    });

    if (selectedMethod === "cod") {
      elements.summaryPaymentText.innerText = "الدفع نقداً عند الاستلام (COD)";
    } else {
      const cardNum = document.getElementById("coCardNum").value;
      const maskedCard = cardNum ? `بطاقة ائتمانية تنتهي بـ **** ${cardNum.slice(-4)}` : "بطاقة اائتمانية";
      elements.summaryPaymentText.innerText = maskedCard;
    }
  }

  // --- CONFETTI SUCCESS EFFECTS ---
  function triggerConfetti() {
    elements.confettiContainer.innerHTML = "";
    const colors = ["#D4AF37", "#ffffff", "#4682B4", "#30d158", "#ff453a"];
    const piecesCount = 80;

    for (let i = 0; i < piecesCount; i++) {
      const piece = document.createElement("div");
      piece.classList.add("confetti-piece");
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.top = `${Math.random() * -20}px`;
      piece.style.width = `${Math.random() * 8 + 5}px`;
      piece.style.height = `${Math.random() * 12 + 6}px`;
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "0";
      piece.style.animationDelay = `${Math.random() * 1.5}s`;
      piece.style.animationDuration = `${Math.random() * 2 + 1.5}s`;

      elements.confettiContainer.appendChild(piece);
    }
  }

  // --- Google Auth Utility Functions (outer scope for initApp access) ---
  function parseJwt(token) {
      try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          return JSON.parse(jsonPayload);
      } catch(e) {
          return null;
      }
  }

  function updateAuthStateUI() {
      const anonState = document.getElementById("anonymousAuthState");
      const loggedInState = document.getElementById("loggedInAuthState");
      const userAuthBtn = document.getElementById("userAuthBtn");
      
      if (userToken) {
          const userData = parseJwt(userToken);
          if (userData) {
              anonState.style.display = "none";
              loggedInState.style.display = "block";
              document.getElementById("userDisplayName").innerText = userData.name || userData.username || "عميل النخبة";
              document.getElementById("userDisplayEmail").innerText = userData.username || "";
              
              const avatarImg = document.getElementById("userAvatarImg");
              if (userData.picture) {
                  avatarImg.src = userData.picture;
                  avatarImg.style.display = "inline-block";
              } else {
                  avatarImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23d4af37'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/></svg>";
              }
              
              userAuthBtn.style.color = "var(--color-gold)";
              return;
          }
      }
      
      anonState.style.display = "block";
      loggedInState.style.display = "none";
      userAuthBtn.style.color = "";
  }

  // --- EVENT LISTENERS REGISTRATION ---
  function registerEventListeners() {
    // Sticky header adjustments
    window.addEventListener("scroll", () => {
      const header = document.getElementById("mainHeader");
      if (window.scrollY > 50) {
        header.style.backgroundColor = "rgba(10, 10, 10, 0.95)";
      } else {
        header.style.backgroundColor = "rgba(10, 10, 10, 0.85)";
      }
    });

    // Mobile Navbar drawer controls
    elements.mobileMenuBtn.addEventListener("click", () => {
      elements.mobileDrawer.classList.add("active");
      elements.drawerOverlay.classList.add("active");
    });
    
    const closeDrawers = () => {
      elements.mobileDrawer.classList.remove("active");
      elements.cartDrawer.classList.remove("active");
      elements.wishlistDrawer.classList.remove("active");
      elements.filterSidebar.classList.remove("active");
      elements.drawerOverlay.classList.remove("active");
    };

    elements.closeMobileDrawer.addEventListener("click", closeDrawers);
    elements.drawerOverlay.addEventListener("click", closeDrawers);

    // Cart drawer toggles
    const cartTriggers = document.querySelectorAll(".cart-trigger");
    cartTriggers.forEach(btn => {
      btn.addEventListener("click", () => {
        elements.cartDrawer.classList.add("active");
        elements.drawerOverlay.classList.add("active");
      });
    });
    elements.closeCartBtn.addEventListener("click", closeDrawers);
    elements.startShoppingBtn.addEventListener("click", closeDrawers);

    // Wishlist drawer toggles
    if (elements.wishlistToggleBtn) {
      elements.wishlistToggleBtn.addEventListener("click", () => {
        elements.wishlistDrawer.classList.add("active");
        elements.drawerOverlay.classList.add("active");
      });
    }
    if (elements.closeWishlistBtn) {
      elements.closeWishlistBtn.addEventListener("click", closeDrawers);
    }
    if (elements.wishlistStartShoppingBtn) {
      elements.wishlistStartShoppingBtn.addEventListener("click", closeDrawers);
    }

    // Mobile Filter Sidebar Toggle
    elements.mobileFilterToggleBtn.addEventListener("click", () => {
      elements.filterSidebar.classList.add("active");
      elements.drawerOverlay.classList.add("active");
    });
    elements.closeFilterSidebar.addEventListener("click", closeDrawers);

    // Hero Slider dot navigation clicks
    elements.dots.forEach(dot => {
      dot.addEventListener("click", () => {
        stopHeroSlider();
        const slideIndex = parseInt(dot.getAttribute("data-slide"));
        showSlide(slideIndex);
        startHeroSlider();
      });
    });

    // Category links navigation clicks (Desktop + Mobile navbar)
    const handleCategoryClick = (e) => {
      const link = e.currentTarget;
      const cat = link.getAttribute("data-category");

      // Update active classes
      elements.navLinks.forEach(l => l.classList.remove("active"));
      elements.mobileNavLinks.forEach(l => l.classList.remove("active"));

      document.querySelectorAll(`[data-category="${cat}"]`).forEach(el => el.classList.add("active"));

      currentFilter.category = cat;
      
      // Update sidebar filter active button
      elements.catFilterBtns.forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("data-cat") === cat) btn.classList.add("active");
      });

      renderProducts();
      closeDrawers();
    };

    elements.navLinks.forEach(link => link.addEventListener("click", handleCategoryClick));
    elements.mobileNavLinks.forEach(link => link.addEventListener("click", handleCategoryClick));

    // Categories preview cards click
    elements.catCards.forEach(card => {
      card.addEventListener("click", () => {
        const cat = card.getAttribute("data-category");
        currentFilter.category = cat;

        elements.navLinks.forEach(l => {
          l.classList.remove("active");
          if (l.getAttribute("data-category") === cat) l.classList.add("active");
        });

        elements.catFilterBtns.forEach(btn => {
          btn.classList.remove("active");
          if (btn.getAttribute("data-cat") === cat) btn.classList.add("active");
        });

        renderProducts();
      });
    });

    // Sidebar Category Filter Buttons Click
    elements.catFilterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        elements.catFilterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const cat = btn.getAttribute("data-cat");
        currentFilter.category = cat;

        // Sync with main navigation links
        elements.navLinks.forEach(l => {
          l.classList.remove("active");
          if (l.getAttribute("data-category") === cat) l.classList.add("active");
        });

        renderProducts();
        closeDrawers();
      });
    });

    // Top Search input listener (keyup search)
    elements.searchInput.addEventListener("keyup", (e) => {
      currentFilter.searchQuery = e.target.value;
      elements.sidebarSearchInput.value = e.target.value; // Sync search inputs
      renderProducts();
    });

    elements.searchBtn.addEventListener("click", () => {
      currentFilter.searchQuery = elements.searchInput.value;
      renderProducts();
    });

    // Sidebar Search input listener
    elements.sidebarSearchInput.addEventListener("keyup", (e) => {
      currentFilter.searchQuery = e.target.value;
      elements.searchInput.value = e.target.value; // Sync search inputs
      renderProducts();
    });

    // Sorting Dropdown selector listener
    elements.sortBySelect.addEventListener("change", (e) => {
      currentFilter.sortBy = e.target.value;
      renderProducts();
    });

    // Price Range Slider changes
    elements.priceRangeSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value);
      currentFilter.maxPrice = val;
      elements.priceMaxVal.innerText = `${val.toLocaleString("ar-EG")} ج.م`;
      renderProducts();
    });

    // Checkboxes change listeners
    elements.inStockCheckbox.addEventListener("change", (e) => {
      currentFilter.inStockOnly = e.target.checked;
      renderProducts();
    });

    elements.featuredCheckbox.addEventListener("change", (e) => {
      currentFilter.featuredOnly = e.target.checked;
      renderProducts();
    });

    // Reset Filters Buttons
    const resetAllFilters = () => {
      currentFilter = {
        category: "all",
        searchQuery: "",
        maxPrice: 15000,
        inStockOnly: true,
        featuredOnly: false,
        sortBy: "featured"
      };

      elements.searchInput.value = "";
      elements.sidebarSearchInput.value = "";
      elements.priceRangeSlider.value = 15000;
      elements.priceMaxVal.innerText = "15,000 ج.م";
      elements.inStockCheckbox.checked = true;
      elements.featuredCheckbox.checked = false;
      elements.sortBySelect.value = "featured";

      elements.catFilterBtns.forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("data-cat") === "all") btn.classList.add("active");
      });

      elements.navLinks.forEach(l => {
        l.classList.remove("active");
        if (l.getAttribute("data-category") === "all") l.classList.add("active");
      });

      renderProducts();
      closeDrawers();
    };

    elements.resetFiltersBtn.addEventListener("click", resetAllFilters);
    elements.resetFiltersBtnEmpty.addEventListener("click", resetAllFilters);

    // Promo Code Application click
    elements.applyPromoBtn.addEventListener("click", () => {
      const code = elements.promoInput.value.toUpperCase().trim();
      if (code === "") {
        elements.promoFeedbackMsg.className = "promo-feedback-msg error";
        elements.promoFeedbackMsg.innerText = "يرجى إدخال كود خصم أولاً.";
        return;
      }

      if (code === "DAVINCI10" || code === "LUXE10") {
        currentPromo = { code: code, type: "percentage", value: 0.1 };
        elements.promoFeedbackMsg.className = "promo-feedback-msg success";
        elements.promoFeedbackMsg.innerText = "تم تطبيق خصم 10% بنجاح!";
        calculateCartTotals();
      } else {
        elements.promoFeedbackMsg.className = "promo-feedback-msg error";
        elements.promoFeedbackMsg.innerText = "كود الخصم غير صحيح أو منتهي الصلاحية.";
      }
    });

    // Quick View Modal Quantity Increment/Decrement
    elements.qvQtyPlus.addEventListener("click", () => {
      const val = parseInt(elements.qvQtyVal.value);
      elements.qvQtyVal.value = Math.min(10, val + 1);
    });

    elements.qvQtyMinus.addEventListener("click", () => {
      const val = parseInt(elements.qvQtyVal.value);
      elements.qvQtyVal.value = Math.max(1, val - 1);
    });

    elements.qvQtyVal.addEventListener("change", (e) => {
      const val = parseInt(e.target.value);
      if (isNaN(val) || val < 1) e.target.value = 1;
      if (val > 10) e.target.value = 10;
    });

    // Modal Close operations
    elements.closeQuickViewBtn.addEventListener("click", closeQuickView);
    elements.quickViewBackdrop.addEventListener("click", closeQuickView);

    // Add to cart from Quick View Modal
    elements.qvAddToCartBtn.addEventListener("click", () => {
      if (!qvSelectedProduct) return;
      const qty = parseInt(elements.qvQtyVal.value);
      
      addToCart(qvSelectedProduct.id, qvSelectedSize, qvSelectedColor, qty);
      closeQuickView();

      // Show Cart Drawer feedback
      elements.cartDrawer.classList.add("active");
      elements.drawerOverlay.classList.add("active");
    });

    // Checkout Modal open click
    elements.checkoutBtn.addEventListener("click", () => {
      closeDrawers();
      showCheckoutStep(1);
      elements.checkoutModal.classList.add("active");
      document.body.style.overflow = "hidden";
    });

    const closeCheckout = () => {
      elements.checkoutModal.classList.remove("active");
      document.body.style.overflow = "auto";
    };
    elements.closeCheckoutBtn.addEventListener("click", closeCheckout);
    elements.checkoutBackdrop.addEventListener("click", closeCheckout);

    // Payment Gate Modal close operations
    const closePaymentGate = () => {
      elements.paymentGateModal.classList.remove("active");
      document.body.style.overflow = "auto";
    };
    elements.closePaymentGateBtn.addEventListener("click", closePaymentGate);
    elements.paymentGateBackdrop.addEventListener("click", closePaymentGate);

    // Checkout Wizard Multi-step Buttons navigation
    elements.coNextStep1.addEventListener("click", () => {
      if (validateStep1()) {
        showCheckoutStep(2);
      }
    });

    elements.coPrevStep2.addEventListener("click", () => {
      showCheckoutStep(1);
    });

    elements.coNextStep2.addEventListener("click", () => {
      // Validate card form if card payment selected
      let selectedMethod = "cod";
      elements.paymentMethods.forEach(method => {
        if (method.checked) selectedMethod = method.value;
      });

      if (selectedMethod === "card") {
        const name = document.getElementById("coCardName");
        const num = document.getElementById("coCardNum");
        const exp = document.getElementById("coCardExpiry");
        const cvv = document.getElementById("coCardCVV");

        if (!name.checkValidity() || !num.checkValidity() || !exp.checkValidity() || !cvv.checkValidity()) {
          name.setAttribute("required", "");
          num.setAttribute("required", "");
          exp.setAttribute("required", "");
          cvv.setAttribute("required", "");
          name.reportValidity() || num.reportValidity() || exp.reportValidity() || cvv.reportValidity();
          return;
        }
      }

      updateCheckoutSummary();
      showCheckoutStep(3);
    });

    elements.coPrevStep3.addEventListener("click", () => {
      showCheckoutStep(2);
    });

    // Payment methods radio toggles for credit card input visibility
    elements.paymentMethods.forEach(method => {
      method.addEventListener("change", (e) => {
        if (e.target.value === "card") {
          elements.paymentCardForm.style.display = "block";
        } else {
          elements.paymentCardForm.style.display = "none";
        }
      });
    });

    // Credit Card formatting tricks (Spaces in card, slash in expiry)
    const cardInput = document.getElementById("coCardNum");
    cardInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "");
      let formatted = "";
      for (let i = 0; i < val.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += " ";
        formatted += val[i];
      }
      e.target.value = formatted;
    });

    const expInput = document.getElementById("coCardExpiry");
    expInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "");
      if (val.length >= 2) {
        e.target.value = val.slice(0, 2) + "/" + val.slice(2, 4);
      } else {
        e.target.value = val;
      }
    });

    // Helper function to submit order payload to backend
    async function submitOrder(orderPayload) {
      try {
          const res = await fetch(`${API_BASE}/orders`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(orderPayload)
          });
          const data = await res.json();
          if (res.ok) {
              elements.coSuccessOrderNum.innerText = data.orderNumber;
          } else {
              elements.coSuccessOrderNum.innerText = `VL-FAILED-${Math.floor(Math.random()*1000)}`;
              console.error("Order failed:", data.error);
          }
      } catch(err) {
          elements.coSuccessOrderNum.innerText = `VL-OFFLINE-${Math.floor(Math.random()*1000)}`;
          console.error("Order request error:", err);
      }

      closeCheckout();
      
      // Clear Cart state completely
      cart = [];
      localStorage.removeItem("davinci_store_cart");
      updateCartUI();

      // Trigger Confetti and success modal
      triggerConfetti();
      elements.successModal.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    // Interactive payment gate generator
    function openPaymentGate(selectedMethod, orderPayload) {
      let gateHtml = '';
      const formattedTotal = formatPrice(orderPayload.total);

      if (selectedMethod === 'card') {
        gateHtml = `
          <div class="secure-badge"><i class="fa-solid fa-shield-halved"></i> بوابة دفع Da Vinci الآمنة 3D Secure</div>
          <div id="cardGateStep1" style="text-align: center; padding: 25px 0;">
            <div style="font-size: 3.5rem; color: var(--color-gold); margin-bottom: 20px; animation: pulse 1.5s infinite;"><i class="fa-solid fa-credit-card"></i></div>
            <h3 class="payment-gate-title">جاري معالجة الدفع بالبطاقة...</h3>
            <p class="payment-instruction">يرجى الانتظار، جاري التواصل الآمن بقيمة <strong>${formattedTotal}</strong></p>
            <div style="width: 45px; height: 45px; border: 4px solid var(--color-border); border-top-color: var(--color-gold); border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto;"></div>
          </div>
          <div id="cardGateStep2" style="display: none;">
            <h3 class="payment-gate-title">تأكيد رمز التحقق (OTP)</h3>
            <p class="payment-instruction">أرسل البنك رمز تحقق مؤقت لهاتفك المحمول لعملية شراء بقيمة <strong>${formattedTotal}</strong>.</p>
            <form class="payment-gate-form" id="cardOtpForm" onsubmit="event.preventDefault();">
              <div class="form-group">
                <label for="otpCode" style="text-align: center; font-weight: bold; margin-bottom: 5px;">رمز التحقق المرسل</label>
                <input type="text" id="otpCode" placeholder="******" required style="text-align: center; font-size: 1.3rem; letter-spacing: 6px; padding: 12px;" maxlength="6">
                <span class="field-help" style="text-align: center; color: var(--color-success); font-size:0.8rem; margin-top: 5px; display:block;">للمحاكاة والقبول، أدخل الرمز: <strong>123456</strong></span>
              </div>
              <button type="submit" class="btn btn-primary w-100" id="submitOtpBtn">تأكيد الدفع وسحب المبلغ <i class="fa-solid fa-lock"></i></button>
            </form>
          </div>
        `;
      } else if (selectedMethod === 'bank') {
        gateHtml = `
          <div class="secure-badge"><i class="fa-solid fa-building-columns"></i> التحويل البنكي المباشر</div>
          <h3 class="payment-gate-title">تأكيد التحويل البنكي</h3>
          <p class="payment-instruction">يرجى تحويل إجمالي المبلغ <strong>${formattedTotal}</strong> إلى الحساب التالي وإدخال تفاصيل التحويل أدناه لتأكيد طلبك:</p>
          
          <div class="payment-details-box">
            <div class="payment-details-val" id="bankValText">${paymentSettings.bank_account || 'EG12345678901234567890 (البنك الأهلي)'}</div>
            <button type="button" class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem;" id="copyBankBtn"><i class="fa-regular fa-copy"></i> نسخ</button>
          </div>
          
          <form class="payment-gate-form" id="bankSubmitForm" onsubmit="event.preventDefault();">
            <div class="form-group">
              <label for="bankSenderName">اسم الحساب المحول منه بالكامل</label>
              <input type="text" id="bankSenderName" placeholder="أدخل اسمك بالكامل كما في البنك" required>
            </div>
            <div class="form-group">
              <label for="bankRef">رقم العملية المرجعي / تفاصيل التحويل</label>
              <input type="text" id="bankRef" placeholder="أدخل رقم العملية أو كود التحويل" required>
            </div>
            <button type="submit" class="btn btn-primary w-100" id="submitBankTransferBtn">تأكيد وإرسال إثبات الدفع <i class="fa-solid fa-circle-check"></i></button>
          </form>
        `;
      } else if (selectedMethod === 'instapay') {
        gateHtml = `
          <div class="secure-badge"><i class="fa-solid fa-bolt"></i> الدفع الفوري عبر InstaPay</div>
          <h3 class="payment-gate-title">تأكيد تحويل InstaPay</h3>
          <p class="payment-instruction">يرجى تحويل إجمالي المبلغ <strong>${formattedTotal}</strong> إلى عنوان انستا باي التالي لتأكيد حجز طلبك:</p>
          
          <div class="payment-details-box">
            <div class="payment-details-val" id="instapayValText">${paymentSettings.instapay || 'eslam.bk@instapay'}</div>
            <button type="button" class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem;" id="copyInstapayBtn"><i class="fa-regular fa-copy"></i> نسخ</button>
          </div>
          
          <form class="payment-gate-form" id="instapaySubmitForm" onsubmit="event.preventDefault();">
            <div class="form-group">
              <label for="instapaySender">عنوان InstaPay المرسل منه (أو اسم المرسل)</label>
              <input type="text" id="instapaySender" placeholder="مثال: name@instapay" required>
            </div>
            <div class="form-group">
              <label for="instapayRef">الرقم المرجعي للمعاملة (Ref ID)</label>
              <input type="text" id="instapayRef" placeholder="أدخل رقم المعاملة المكون من 12 رقماً" required maxlength="12">
            </div>
            <button type="submit" class="btn btn-primary w-100" id="submitInstaPayTransferBtn">تأكيد وإرسال التحويل <i class="fa-solid fa-paper-plane"></i></button>
          </form>
        `;
      } else if (selectedMethod === 'ewallet') {
        gateHtml = `
          <div class="secure-badge"><i class="fa-solid fa-mobile-screen-button"></i> دفع المحافظ الإلكترونية</div>
          <h3 class="payment-gate-title">تحويل المحفظة الذكية</h3>
          <p class="payment-instruction">يرجى تحويل إجمالي المبلغ <strong>${formattedTotal}</strong> كاش إلى رقم المحفظة التالي لتأكيد الشحن:</p>
          
          <div class="payment-details-box">
            <div class="payment-details-val" id="ewalletValText">${paymentSettings.ewallets || '01190622530 (فودافون كاش)'}</div>
            <button type="button" class="btn btn-outline" style="padding: 6px 12px; font-size: 0.8rem;" id="copyEwalletBtn"><i class="fa-regular fa-copy"></i> نسخ</button>
          </div>
          
          <form class="payment-gate-form" id="ewalletSubmitForm" onsubmit="event.preventDefault();">
            <div class="form-group">
              <label for="ewalletSenderPhone">رقم الهاتف الذي قمت بالتحويل منه</label>
              <input type="text" id="ewalletSenderPhone" placeholder="مثال: 01012345678" required pattern="^01[0-2,5]{1}[0-9]{8}$">
            </div>
            <div class="form-group">
              <label for="ewalletTxId">الرقم التعريفي للمعاملة المستلم في الرسالة</label>
              <input type="text" id="ewalletTxId" placeholder="أدخل رمز العملية (Transaction ID)" required>
            </div>
            <button type="submit" class="btn btn-primary w-100" id="submitEwalletTransferBtn">تأكيد إرسال الكاش <i class="fa-solid fa-circle-check"></i></button>
          </form>
        `;
      }

      elements.paymentGateDynamicContainer.innerHTML = gateHtml;
      elements.paymentGateModal.classList.add('active');
      document.body.style.overflow = "hidden";

      // Bind copy buttons actions
      const copyBankBtn = document.getElementById('copyBankBtn');
      if (copyBankBtn) {
        copyBankBtn.addEventListener('click', () => {
          const val = document.getElementById('bankValText').innerText.split(' ')[0];
          navigator.clipboard.writeText(val);
          copyBankBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ';
          setTimeout(() => { copyBankBtn.innerHTML = '<i class="fa-regular fa-copy"></i> نسخ'; }, 2000);
        });
      }

      const copyInstapayBtn = document.getElementById('copyInstapayBtn');
      if (copyInstapayBtn) {
        copyInstapayBtn.addEventListener('click', () => {
          const val = document.getElementById('instapayValText').innerText.trim();
          navigator.clipboard.writeText(val);
          copyInstapayBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ';
          setTimeout(() => { copyInstapayBtn.innerHTML = '<i class="fa-regular fa-copy"></i> نسخ'; }, 2000);
        });
      }

      const copyEwalletBtn = document.getElementById('copyEwalletBtn');
      if (copyEwalletBtn) {
        copyEwalletBtn.addEventListener('click', () => {
          const val = document.getElementById('ewalletValText').innerText.split(' ')[0];
          navigator.clipboard.writeText(val);
          copyEwalletBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ';
          setTimeout(() => { copyEwalletBtn.innerHTML = '<i class="fa-regular fa-copy"></i> نسخ'; }, 2000);
        });
      }

      // Handle custom payment gates submit/authorization
      if (selectedMethod === 'card') {
        setTimeout(() => {
          const s1 = document.getElementById('cardGateStep1');
          const s2 = document.getElementById('cardGateStep2');
          if (s1 && s2) {
            s1.style.display = 'none';
            s2.style.display = 'block';
          }
        }, 1800);

        const cardOtpForm = document.getElementById('cardOtpForm');
        if (cardOtpForm) {
          cardOtpForm.addEventListener('submit', () => {
            const codeVal = document.getElementById('otpCode').value.trim();
            if (codeVal !== '123456') {
              alert('رمز التحقق (OTP) غير صحيح! يرجى إدخال الرقم 123456 للقبول والمحاكاة.');
              return;
            }

            // Capture card dummy info
            orderPayload.payment_sender = "Visa/Mastercard (الدفع الآمن)";
            orderPayload.payment_reference = "TXN-CARD-" + Math.floor(100000 + Math.random() * 900000);

            elements.paymentGateDynamicContainer.innerHTML = `
              <div class="secure-badge"><i class="fa-solid fa-shield-halved"></i> تم التفويض بنجاح</div>
              <div style="text-align: center; padding: 25px 0;">
                <div style="margin: 0 auto 20px; width: 60px; height: 60px; border-radius: 50%; border: 3px solid var(--color-success); display: flex; align-items: center; justify-content: center; color: var(--color-success); font-size: 2rem;">
                  <i class="fa-solid fa-check"></i>
                </div>
                <h3 class="payment-gate-title">تم سحب المبلغ بنجاح</h3>
                <p class="payment-instruction">تم سحب القيمة المالية وإتمام عملية الدفع الآمنة، جاري تسجيل طلبك...</p>
              </div>
            `;
            setTimeout(() => {
              elements.paymentGateModal.classList.remove('active');
              submitOrder(orderPayload);
            }, 1500);
          });
        }
      } else {
        const formId = selectedMethod === 'bank' ? 'bankSubmitForm' : (selectedMethod === 'instapay' ? 'instapaySubmitForm' : 'ewalletSubmitForm');
        const form = document.getElementById(formId);
        if (form) {
          form.addEventListener('submit', () => {
            if (selectedMethod === 'bank') {
              orderPayload.payment_sender = document.getElementById('bankSenderName').value.trim();
              orderPayload.payment_reference = document.getElementById('bankRef').value.trim();
            } else if (selectedMethod === 'instapay') {
              orderPayload.payment_sender = document.getElementById('instapaySender').value.trim();
              orderPayload.payment_reference = document.getElementById('instapayRef').value.trim();
            } else if (selectedMethod === 'ewallet') {
              orderPayload.payment_sender = document.getElementById('ewalletSenderPhone').value.trim();
              orderPayload.payment_reference = document.getElementById('ewalletTxId').value.trim();
            }

            elements.paymentGateDynamicContainer.innerHTML = `
              <div class="secure-badge"><i class="fa-solid fa-rotate"></i> جاري مطابقة بيانات التحويل</div>
              <div style="text-align: center; padding: 25px 0;">
                <div style="width: 45px; height: 45px; border: 4px solid var(--color-border); border-top-color: var(--color-gold); border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto;"></div>
                <h3 class="payment-gate-title">جاري مراجعة التحويل...</h3>
                <p class="payment-instruction">نقوم الآن بالتحقق من وصول المبلغ بنجاح عبر الشبكة البنكية والمحافظ الذكية.</p>
              </div>
            `;
            setTimeout(() => {
              elements.paymentGateDynamicContainer.innerHTML = `
                <div class="secure-badge"><i class="fa-solid fa-check"></i> تم استلام إثبات الدفع</div>
                <div style="text-align: center; padding: 25px 0;">
                  <div style="margin: 0 auto 20px; width: 60px; height: 60px; border-radius: 50%; border: 3px solid var(--color-success); display: flex; align-items: center; justify-content: center; color: var(--color-success); font-size: 2rem;">
                    <i class="fa-solid fa-check"></i>
                  </div>
                  <h3 class="payment-gate-title">تم تسجيل إثبات التحويل</h3>
                  <p class="payment-instruction">تم استلام تفاصيل العملية بنجاح، جاري إتمام حجز وشحن طلبك الفاخر...</p>
                </div>
              `;
              setTimeout(() => {
                elements.paymentGateModal.classList.remove('active');
                submitOrder(orderPayload);
              }, 1500);
            }, 2000);
          });
        }
      }
    }

    // Final Order Submit Form execution
    elements.checkoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      let selectedMethod = "cod";
      const methods = document.getElementsByName("paymentMethod");
      methods.forEach(m => {
        if (m.checked) selectedMethod = m.value;
      });

      const subtotal = cart.reduce((sum, item) => {
        const prod = products.find(p => Number(p.id) === Number(item.productId));
        return sum + (prod ? prod.price * item.quantity : 0);
      }, 0);

      let discount = 0;
      if (currentPromo && currentPromo.type === "percentage") {
        discount = Math.round(subtotal * currentPromo.value);
      }

      const total = Math.max(0, subtotal - discount);

      const orderPayload = {
          customer_name: document.getElementById("coFirstName").value + " " + document.getElementById("coLastName").value,
          phone: document.getElementById("coPhone").value,
          address: document.getElementById("coAddress").value,
          governorate: document.getElementById("coGovernorate").value,
          city: document.getElementById("coCity").value,
          payment_method: selectedMethod,
          subtotal: subtotal,
          discount: discount,
          total: total,
          items: cart.map(item => {
              const p = products.find(prod => Number(prod.id) === Number(item.productId));
              return {
                  name: p ? p.name : 'منتج غير معروف',
                  quantity: item.quantity,
                  price: p ? p.price : 0,
                  size: String(item.size || 'N/A'),
                  color: item.color && item.color.name ? item.color.name : 'افتراضي'
              };
          })
      };

      if (selectedMethod === "cod") {
        submitOrder(orderPayload);
      } else {
        openPaymentGate(selectedMethod, orderPayload);
      }
    });

    elements.closeSuccessBtn.addEventListener("click", () => {
      elements.successModal.classList.remove("active");
      document.body.style.overflow = "auto";
    });

    // Newsletter simulated submission
    elements.newsletterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = elements.newsletterEmail.value;

      elements.newsletterEmail.disabled = true;
      const subBtn = elements.newsletterForm.querySelector("button");
      subBtn.disabled = true;
      subBtn.innerText = "جاري الاشتراك...";

      setTimeout(() => {
        elements.newsletterEmail.value = "";
        elements.newsletterEmail.disabled = false;
        subBtn.disabled = false;
        subBtn.innerText = "اشترك الآن";

        elements.newsletterMessage.className = "newsletter-feedback-msg success";
        elements.newsletterMessage.innerText = "أهلاً بك! تم إرسال رسالة ترحيبية فاخرة إلى بريدك الإلكتروني.";
      }, 1500);
    });

    // (parseJwt and updateAuthStateUI are defined above in outer scope)

    window.vogueHandleGoogleCredential = async (response) => {
        const errEl = document.getElementById("userLoginError");
        if (errEl) errEl.innerText = "";
        
        try {
            const res = await fetch(`${API_BASE}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: response.credential, isMock: false })
            });
            const data = await res.json();
            if (res.ok) {
                userToken = data.token;
                localStorage.setItem("userToken", userToken);
                closeAuth();
                updateAuthStateUI();
                alert("تم تسجيل الدخول بحساب جوجل بنجاح");
            } else {
                if (errEl) errEl.innerText = data.error || "خطأ أثناء تسجيل الدخول بجوجل";
            }
        } catch (err) {
            if (errEl) errEl.innerText = "خطأ في الاتصال بالخادم";
        }
    };

    window.initGoogleSignIn = () => {
        const btnContainer = document.getElementById("googleSignInButton");
        if (!btnContainer) return;
        
        if (typeof google !== 'undefined' && google.accounts) {
            google.accounts.id.initialize({
                client_id: "1096739958133-cbgk6b4f74d08r66l5k5j6871hbjh2m4.apps.googleusercontent.com", // Fallback test Client ID
                callback: window.vogueHandleGoogleCredential
            });
            google.accounts.id.renderButton(
                btnContainer,
                { theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 250 }
            );
        } else {
            setTimeout(window.initGoogleSignIn, 1000);
        }
    };

    // --- User Auth Modal Listeners ---
    const userAuthBtn = document.getElementById("userAuthBtn");
    const userAuthModal = document.getElementById("userAuthModal");
    const closeAuthBtn = document.getElementById("closeAuthBtn");
    const authBackdrop = document.getElementById("authBackdrop");
    
    const closeAuth = () => { userAuthModal.classList.remove("active"); };
    closeAuthBtn.addEventListener("click", closeAuth);
    authBackdrop.addEventListener("click", closeAuth);

    userAuthBtn.addEventListener("click", () => {
        userAuthModal.classList.add("active");
        updateAuthStateUI();
    });

    document.getElementById("mockGoogleLoginBtn").addEventListener("click", async () => {
        const mockEmail = `test.user.${Math.floor(Math.random()*10000)}@gmail.com`;
        const mockName = `عميل نخبة تجريبي (${Math.floor(Math.random()*1000)})`;
        const errEl = document.getElementById("userLoginError");
        if (errEl) errEl.innerText = "";
        
        try {
            const res = await fetch(`${API_BASE}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    isMock: true, 
                    mockData: {
                        email: mockEmail,
                        name: mockName,
                        picture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80"
                    }
                })
            });
            const data = await res.json();
            if (res.ok) {
                userToken = data.token;
                localStorage.setItem("userToken", userToken);
                closeAuth();
                updateAuthStateUI();
                alert("تم تسجيل الدخول التجريبي بنجاح");
            } else {
                if (errEl) errEl.innerText = data.error || "خطأ في الدخول التجريبي";
            }
        } catch (err) {
            if (errEl) errEl.innerText = "خطأ في الاتصال بالخادم";
        }
    });

    document.getElementById("userLogoutBtn").addEventListener("click", () => {
        userToken = null;
        localStorage.removeItem("userToken");
        closeAuth();
        updateAuthStateUI();
        alert("تم تسجيل الخروج بنجاح");
    });

  }
});
