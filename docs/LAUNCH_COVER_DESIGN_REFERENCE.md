# 啟動封面頁視覺設計快速參考

## 🎨 配色方案

```css
/* 背景漸層 */
background: linear-gradient(
  135deg,
  #0a0e27 0%,
  /* 深藍黑 */ #1a1f3a 50%,
  /* 中藍黑 */ #0f1729 100% /* 深灰黑 */
);

/* 標題漸層 */
background: linear-gradient(
  135deg,
  #ffffff 0%,
  /* 白色 */ #60a5fa 50%,
  /* 淺藍 */ #a78bfa 100% /* 紫色 */
);

/* 卡片 1 - 營收（綠色） */
color: #10b981;
border-color: rgba(16, 185, 129, 0.3);

/* 卡片 2 - VIP（藍色） */
color: #3b82f6;
border-color: rgba(59, 130, 246, 0.3);

/* 卡片 3 - 待關懷（橘色） */
color: #fb923c;
border-color: rgba(251, 146, 60, 0.3);

/* 按鈕漸層 */
background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
```

## 📐 尺寸規格

```css
/* 標題 */
font-size: 2.8rem; /* Desktop */
font-size: 2.2rem; /* Tablet */
font-size: 1.8rem; /* Mobile */

/* 卡片 */
min-height: 240px; /* Desktop */
min-height: 220px; /* Tablet */
min-height: 180px; /* Mobile */
border-radius: 20px;
padding: 40px 28px;

/* 卡片圖標 */
font-size: 3.5rem;

/* 卡片數字 */
font-size: 2.8rem; /* Desktop */
font-size: 2.4rem; /* Tablet */
font-size: 2.2rem; /* Mobile */

/* 按鈕 */
padding: 20px 40px;
font-size: 1.15rem;
border-radius: 14px;
```

## ✨ Glassmorphism 效果

```css
.launch-glass-card {
  /* 半透明背景 */
  background: rgba(255, 255, 255, 0.08);

  /* 背景模糊 */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);

  /* 微弱邊框 */
  border: 1px solid rgba(255, 255, 255, 0.18);

  /* 圓角 */
  border-radius: 20px;
}
```

## 🌟 發光效果

```css
/* 數字發光 */
text-shadow: 0 0 30px rgba(16, 185, 129, 0.5); /* 綠色 */
text-shadow: 0 0 30px rgba(59, 130, 246, 0.5); /* 藍色 */
text-shadow: 0 0 30px rgba(251, 146, 60, 0.5); /* 橘色 */

/* 按鈕發光 */
box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4), /* 外陰影 */ 0 0 40px rgba(59, 130, 246, 0.2),
  /* 外發光 */ inset 0 1px 0 rgba(255, 255, 255, 0.2); /* 內發光 */

/* Hover 強化 */
box-shadow: 0 8px 30px rgba(59, 130, 246, 0.5), 0 0 60px rgba(59, 130, 246, 0.3);
```

## 🎬 動畫時長

```css
/* 進場動畫 */
animation: fadeInUp 600ms cubic-bezier(0.4, 0, 0.2, 1);

/* 退場動畫 */
transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);

/* 卡片 Hover */
transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);

/* 按鈕 Hover */
transition: all 350ms cubic-bezier(0.4, 0, 0.2, 1);

/* 圖標浮動 */
animation: float 3s ease-in-out infinite;

/* 背景粒子 */
animation: particleMove 20s linear infinite;
```

## 📱 響應式斷點

```css
/* Desktop */
@media (min-width: 1201px) {
  .launch-cards-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
  }
}

/* Tablet */
@media (max-width: 1200px) and (min-width: 901px) {
  .launch-cards-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
}

/* Mobile */
@media (max-width: 900px) {
  .launch-cards-grid {
    grid-template-columns: 1fr;
    gap: 20px;
    max-width: 500px;
  }
}
```

## 🔤 字體設定

```css
/* 標題 */
font-family: "Noto Sans TC", "Inter", sans-serif;
font-weight: 800;
letter-spacing: 1px;

/* 卡片標籤 */
font-family: "Noto Sans TC", "Inter", sans-serif;
font-weight: 600;
letter-spacing: 1.5px;
text-transform: uppercase;

/* 卡片數字 */
font-family: "Inter", "Noto Sans TC", sans-serif;
font-weight: 800;
letter-spacing: -1px;

/* 按鈕 */
font-family: "Noto Sans TC", "Inter", sans-serif;
font-weight: 700;
```

## 💎 圖標選擇

```html
<!-- 營收 -->
<div class="card-icon">💰</div>
<!-- 錢袋 -->
<!-- 或 -->
<div class="card-icon">📈</div>
<!-- 趨勢圖 -->

<!-- VIP -->
<div class="card-icon">💎</div>
<!-- 鑽石 -->
<!-- 或 -->
<div class="card-icon">👑</div>
<!-- 皇冠 -->

<!-- 待關懷 -->
<div class="card-icon">🔔</div>
<!-- 鈴鐺 -->
<!-- 或 -->
<div class="card-icon">❤️‍🩹</div>
<!-- 愛心 -->
```

## 🎯 使用範例

### TypeScript 數字格式化

```typescript
// 營收格式化為萬元
const revenue = 38290000;
const formatted = Math.round(revenue / 10000);
const display = `$${formatted.toLocaleString("zh-TW")} 萬`;
// 輸出：$3,829 萬
```

### HTML 卡片結構

```html
<div class="launch-glass-card card-revenue">
  <div class="card-icon">💰</div>
  <div class="card-label">本月總營收</div>
  <div class="card-value">$3,829 萬</div>
</div>
```

### CSS 自訂卡片配色

```css
.card-custom {
  border-color: rgba(YOUR_COLOR_R, YOUR_COLOR_G, YOUR_COLOR_B, 0.3);
}

.card-custom .card-value {
  color: #YOUR_HEX_COLOR;
  text-shadow: 0 0 30px rgba(YOUR_COLOR_R, YOUR_COLOR_G, YOUR_COLOR_B, 0.5);
}

.card-custom:hover {
  background: rgba(YOUR_COLOR_R, YOUR_COLOR_G, YOUR_COLOR_B, 0.05);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), inset 0 0 40px rgba(YOUR_COLOR_R, YOUR_COLOR_G, YOUR_COLOR_B, 0.1);
}
```

---

**快速參考建立完成！** 🚀

此文檔提供所有關鍵設計參數，方便未來調整與擴充。
