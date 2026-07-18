const products = [
  // --- Category: shoes (أحذية) ---
  {
    id: "shoes-1",
    name: "حذاء ألترامكس الذهبي الفاخر",
    category: "shoes",
    categoryName: "أحذية",
    price: 4900,
    oldPrice: 6200,
    rating: 4.9,
    reviewsCount: 128,
    image: "./assets/images/shoes_ultramax_gold.jpg",
    description: "حذاء رياضي يجمع بين الفخامة والراحة المتناهية. يتميز بنعل أوسط مبطن بتقنية متطورة لامتصاص الصدمات وتفاصيل ذهبية تعكس الرقي.",
    sizes: [40, 41, 42, 43, 44, 45],
    colors: [
      { name: "أسود ذهبي", code: "#1a1a1a", secondary: "#D4AF37" },
      { name: "أبيض ذهبي", code: "#ffffff", secondary: "#D4AF37" }
    ],
    inStock: true,
    featured: true
  },
  {
    id: "shoes-2",
    name: "حذاء رويال جلدي كلاسيكي",
    category: "shoes",
    categoryName: "أحذية",
    price: 5800,
    oldPrice: null,
    rating: 4.8,
    reviewsCount: 84,
    image: "./assets/images/shoes_royal_classic.jpg",
    description: "حذاء رسمي مصنوع يدويًا من جلد العجل الطبيعي 100%. تصميم إيطالي كلاسيكي يضفي لمسة من الأناقة والجاذبية على إطلالتك الرسمية.",
    sizes: [39, 40, 41, 42, 43, 44],
    colors: [
      { name: "بني داكن", code: "#5C4033", secondary: "#5C4033" },
      { name: "أسود ملكي", code: "#000000", secondary: "#000000" }
    ],
    inStock: true,
    featured: true
  },
  {
    id: "shoes-3",
    name: "حذاء نيو-ستريت العصري",
    category: "shoes",
    categoryName: "أحذية",
    price: 3200,
    oldPrice: 3800,
    rating: 4.6,
    reviewsCount: 62,
    image: "./assets/images/shoes_new_street.jpg",
    description: "حذاء كاجوال بتصميم عصري جريء ومريح للمشي اليومي. يتميز بجزء علوي من نسيج يسمح بالتهوية ونعل مطاطي متين ومرن.",
    sizes: [40, 41, 42, 43, 44],
    colors: [
      { name: "رمادي بلمسات برتقالية", code: "#808080", secondary: "#FF5733" },
      { name: "أزرق داكن", code: "#000080", secondary: "#ffffff" }
    ],
    inStock: true,
    featured: false
  },

  // --- Category: clothing (ملابس) ---
  {
    id: "cloth-1",
    name: "سترة جلدية 'ستيلث' الفخمة",
    category: "clothing",
    categoryName: "ملابس",
    price: 7900,
    oldPrice: 9500,
    rating: 5.0,
    reviewsCount: 45,
    image: "./assets/images/cloth_stealth_leather.jpg",
    description: "جاكيت جلد طبيعي فاخر بتصميم عصري مميز وقصة مثالية. يمنحك الدفء والمظهر الجذاب والقوي في آن واحد. أزرار وسحابات معدنية مقاومة للصدأ.",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: [
      { name: "أسود مطفي", code: "#1a1a1a", secondary: "#1a1a1a" },
      { name: "بني عتيق", code: "#3d2314", secondary: "#3d2314" }
    ],
    inStock: true,
    featured: true
  },
  {
    id: "cloth-2",
    name: "كنزة صوفية أوفرسايز بيج",
    category: "clothing",
    categoryName: "ملابس",
    price: 1850,
    oldPrice: 2400,
    rating: 4.7,
    reviewsCount: 92,
    image: "./assets/images/cloth_oversize_beige.jpg",
    description: "كنزة صوفية (هودي) بتصميم أوفرسايز مريح للغاية، مصنوعة من قطن مصري فاخر ومبطنة بطبقة ناعمة لتوفر دفئاً ممتازاً ومظهراً كاجوال فخماً.",
    sizes: ["M", "L", "XL", "XXL"],
    colors: [
      { name: "بيج كريمي", code: "#f5ebe0", secondary: "#f5ebe0" },
      { name: "أسود داكن", code: "#0a0a0a", secondary: "#0a0a0a" }
    ],
    inStock: true,
    featured: true
  },
  {
    id: "cloth-3",
    name: "قميص كتان ملكي إيطالي",
    category: "clothing",
    categoryName: "ملابس",
    price: 1450,
    oldPrice: null,
    rating: 4.5,
    reviewsCount: 38,
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80",
    description: "قميص صيفي مصنوع من الكتان الإيطالي الطبيعي والبارد. قصة مريحة تسمح بمرور الهواء وتضفي طابعاً من الرقي والاسترخاء في المناسبات غير الرسمية.",
    sizes: ["S", "M", "L", "XL"],
    colors: [
      { name: "أبيض ثلجي", code: "#ffffff", secondary: "#ffffff" },
      { name: "أزرق سماوي", code: "#87CEEB", secondary: "#87CEEB" }
    ],
    inStock: true,
    featured: false
  },

  // --- Category: pants (بناطيل) ---
  {
    id: "pants-1",
    name: "بنطال كارجو تكتيكي نيرو",
    category: "pants",
    categoryName: "بناطيل",
    price: 1650,
    oldPrice: 2100,
    rating: 4.7,
    reviewsCount: 110,
    image: "https://images.unsplash.com/photo-1516826957135-700ede19c6ce?w=800&q=80",
    description: "بنطال كارجو بتصميم جيوب متعددة عملي ومظهر عصري جذاب. مصنوع من قماش قطني متين ومقاوم للتمزق مع لمسة مطاطية مريحة.",
    sizes: [30, 32, 34, 36, 38],
    colors: [
      { name: "زيتي عسكري", code: "#4b5320", secondary: "#4b5320" },
      { name: "أسود فحم", code: "#242424", secondary: "#242424" }
    ],
    inStock: true,
    featured: false
  },
  {
    id: "pants-2",
    name: "بنطال جينز سليم-فت فاخر",
    category: "pants",
    categoryName: "بناطيل",
    price: 1950,
    oldPrice: null,
    rating: 4.8,
    reviewsCount: 75,
    image: "https://images.unsplash.com/photo-1542272454315-4c01d7abdf4a?w=800&q=80",
    description: "بنطال جينز أزرق داكن بقصة سليم-فت الرائعة. تفاصيل حياكة متقنة وقماش جينز فاخر يحتفظ بمرونته ومظهره المميز طويلاً.",
    sizes: [28, 30, 32, 34, 36],
    colors: [
      { name: "أزرق غامق", code: "#1C2951", secondary: "#1C2951" },
      { name: "أزرق باهت", code: "#4682B4", secondary: "#4682B4" }
    ],
    inStock: true,
    featured: true
  },
  {
    id: "pants-3",
    name: "بنطال تشينو كلاسيكي كاجوال",
    category: "pants",
    categoryName: "بناطيل",
    price: 1500,
    oldPrice: 1900,
    rating: 4.6,
    reviewsCount: 50,
    image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80",
    description: "بنطال تشينو مريح جداً مصنوع من القطن المطاطي الناعم. قصة أنيقة تناسب بيئة العمل الكاجوال والطلعات اليومية المريحة.",
    sizes: [30, 32, 34, 36],
    colors: [
      { name: "بيج كلاسيكي", code: "#C2B280", secondary: "#C2B280" },
      { name: "كحلي داكن", code: "#000080", secondary: "#000080" }
    ],
    inStock: true,
    featured: false
  },

  // --- Category: accessories (إكسسوارات) ---
  {
    id: "acc-1",
    name: "ساعة 'كرونوغراف' الفخمة سوداء",
    category: "accessories",
    categoryName: "إكسسوارات",
    price: 11500,
    oldPrice: 14000,
    rating: 4.9,
    reviewsCount: 37,
    image: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80",
    description: "ساعة يد رجالية فاخرة مزودة بمينا كرونوغراف وسوار من الفولاذ المقاوم للصدأ ومقاومة للماء حتى عمق 50 متراً. تعبير حقيقي عن القوة والأناقة.",
    sizes: ["Standard"],
    colors: [
      { name: "أسود مطفي", code: "#111111", secondary: "#D4AF37" },
      { name: "فضي ملكي", code: "#c0c0c0", secondary: "#c0c0c0" }
    ],
    inStock: true,
    featured: true
  },
  {
    id: "acc-2",
    name: "نظارة شمسية 'بريداتور' القاتمة",
    category: "accessories",
    categoryName: "إكسسوارات",
    price: 2400,
    oldPrice: null,
    rating: 4.7,
    reviewsCount: 29,
    image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80",
    description: "نظارات شمسية بعدسات مستقطبة (Polarized) توفر حماية 100% من الأشعة فوق البنفسجية UV400. إطار معدني خفيف الوزن وقوي بتصميم عصري جذاب.",
    sizes: ["Standard"],
    colors: [
      { name: "أسود كربوني", code: "#1a1a1a", secondary: "#1a1a1a" }
    ],
    inStock: true,
    featured: false
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = products;
}
