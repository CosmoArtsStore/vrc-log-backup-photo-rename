# Alpheratz src Bundle

生成元: `F:/DEVELOPFOLDER/STELLAProject/Alpheratz/src`

---

## FILE: App.css

`$ext
/* ================================================================
   Alpheratz – App.css
   Tailwind との干渉を避けるため:
   - CSS変数は --a- プレフィックス付き
   - ルートセレクタは .alpheratz-root で完全にスコープ化
   ================================================================ */
/* 全体の余白リセット */
html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  /* ブラウザ自体のスクロールを完全に禁止 */
  width: 100%;
  height: 100%;
}

/* ─── Variables（Tailwind preflight と衝突しないよう .alpheratz-root にスコープ） */
.alpheratz-root {
  --a-accent: #6366f1;
  --a-accent-light: #818cf8;
  --a-accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6);
  --a-bg: #fafbfc;
  --a-surface: #ffffff;
  --a-border: #e5e7eb;
  --a-text: #1f2937;
  --a-text-dim: #6b7280;
  --a-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --a-font-mono: "JetBrains Mono", "Fira Code", monospace;
  --a-radius: 16px;
  --a-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --a-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
  --a-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);

  /* ─ Layout ─ */
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: var(--a-font-sans);
  background: var(--a-bg);
  color: var(--a-text);
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
}

/* すべての子孫に border-box を適用（Tailwind preflight が上書きしてしまう場合の保険） */
.alpheratz-root *,
.alpheratz-root *::before,
.alpheratz-root *::after {
  box-sizing: border-box;
}

/* ─── Header ────────────────────────────────────────────────── */
.alpheratz-root .header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 左右端まで完全に伸ばす */
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: var(--a-surface);
  border-bottom: 1px solid var(--a-border);
  flex-shrink: 0;
  gap: 1rem;
  z-index: 10;
}

.alpheratz-root .logo-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.alpheratz-root .menu-button {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--a-border);
  background: var(--a-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.alpheratz-root .menu-button:hover,
.alpheratz-root .menu-button.active {
  border-color: var(--a-accent-light);
  box-shadow: var(--a-shadow-sm);
}

.alpheratz-root .logo-group h1 {
  font-size: 1.1rem;
  font-weight: 800;
  background: var(--a-accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  margin: 0;
}

.alpheratz-root .badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--a-accent);
  white-space: nowrap;
}

.alpheratz-root .search-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  max-width: 560px;
}

.alpheratz-root .input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  background: var(--a-bg);
  border: 1px solid var(--a-border);
  border-radius: 12px;
  padding: 0 0.75rem;
  transition: border-color 0.2s;
}

.alpheratz-root .input-group:focus-within {
  border-color: var(--a-accent-light);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}

.alpheratz-root .input-group input {
  border: none;
  background: none;
  outline: none;
  font-size: 0.85rem;
  padding: 0.6rem 0;
  width: 100%;
  color: var(--a-text);
}

.alpheratz-root .search-bar select {
  padding: 0.6rem 2.2rem 0.6rem 0.75rem;
  border: 1px solid var(--a-border);
  border-radius: 12px;
  background: var(--a-bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 0.75rem center;
  appearance: none;
  font-size: 0.82rem;
  color: var(--a-text);
  outline: none;
  cursor: pointer;
  max-width: 180px;
  min-width: 130px;
  transition: border-color 0.2s;
}

.alpheratz-root .search-bar select:hover,
.alpheratz-root .search-bar select:focus {
  border-color: var(--a-accent-light);
}

.alpheratz-root .icon-svg {
  width: 18px;
  height: 18px;
  fill: var(--a-text-dim);
  flex-shrink: 0;
}

/* ─── Main Content ──────────────────────────────────────────── */
.alpheratz-root .main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.5rem;
  overflow: hidden;
  /* 内部でスクロール制御 */
  min-height: 0;
  gap: 1rem;
}

/* ─── Grid area ─────────────────────────────────────────────── */
.alpheratz-root .grid-area {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  position: relative;
  align-items: stretch;
}

/* ─── Month navigation sidebar ──────────────────────────────── */
.alpheratz-root .month-nav {
  width: 128px;
  flex-shrink: 0;
  height: 100%;
  /* 親 (.grid-area) が flex:1 ならこれで下端まで伸びる */
  overflow-y: auto;
  padding: 0.25rem 0 0.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-right: 1.5px solid rgba(99, 102, 241, 0.08);
  margin-right: 1rem;
  position: relative;
}

.alpheratz-root .month-nav::before {
  content: "";
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 20px;
  width: 1.5px;
  background: linear-gradient(to bottom,
      transparent,
      rgba(99, 102, 241, 0.15) 5%,
      rgba(99, 102, 241, 0.15) 95%,
      transparent);
  pointer-events: none;
  z-index: 0;
}

.alpheratz-root .filter-sidebar {
  width: 0;
  opacity: 0;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.25s ease, opacity 0.25s ease, margin-right 0.25s ease;
  margin-right: 0;
}

.alpheratz-root .filter-sidebar.open {
  width: 260px;
  opacity: 1;
  margin-right: 1rem;
  padding: 1rem;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  background: var(--a-surface);
  box-shadow: var(--a-shadow-sm);
}

.alpheratz-root .filter-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.alpheratz-root .filter-sidebar-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.alpheratz-root .filter-reset-button {
  border: 1px solid var(--a-border);
  background: var(--a-bg);
  border-radius: 10px;
  padding: 0.4rem 0.7rem;
  cursor: pointer;
}

.alpheratz-root .filter-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.9rem;
}

.alpheratz-root .filter-section label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--a-text-dim);
}

.alpheratz-root .filter-section input,
.alpheratz-root .filter-section select {
  width: 100%;
  border: 1px solid var(--a-border);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font-size: 0.82rem;
  background: var(--a-bg);
}

.alpheratz-root .filter-section.checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--a-text);
}

.alpheratz-root .filter-section.checkbox input {
  width: auto;
}

.alpheratz-root .filter-note {
  font-size: 0.72rem;
  color: var(--a-text-dim);
  line-height: 1.5;
  margin: 0.5rem 0 0;
}

.alpheratz-root .month-nav-year {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--a-text-dim);
  text-transform: uppercase;
  padding: 0.6rem 0.5rem 0.3rem 0.5rem;
  opacity: 0.7;
}

.alpheratz-root .month-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.4rem 0.35rem 0.3rem;
  cursor: pointer;
  border-radius: 10px;
  transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1);
  z-index: 1;
}

.alpheratz-root .month-nav-item:hover {
  background: rgba(99, 102, 241, 0.07);
}

.alpheratz-root .month-nav-item.active {
  background: rgba(99, 102, 241, 0.10);
}

.alpheratz-root .month-nav-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.25);
  flex-shrink: 0;
  margin-left: 13px;
  transition: all 0.25s;
  border: 1.5px solid transparent;
}

.alpheratz-root .month-nav-item.active .month-nav-dot {
  background: var(--a-accent-gradient);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  transform: scale(1.2);
}

.alpheratz-root .month-nav-item:hover .month-nav-dot {
  background: rgba(99, 102, 241, 0.5);
}

.alpheratz-root .month-nav-label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}

.alpheratz-root .month-nav-name {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--a-text-dim);
  transition: color 0.2s;
  white-space: nowrap;
}

.alpheratz-root .month-nav-item.active .month-nav-name {
  background: var(--a-accent-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 800;
}

.alpheratz-root .month-nav-count {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--a-text-dim);
  opacity: 0.65;
}

/* ─── Right panel ────────────────────────────────────────────── */
.alpheratz-root .right-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* overflow:hidden は action-card の hover shadow を切るので使わない */
  /* 代わりにカード行だけ少しパディングを持たせてシャドウ分を確保 */
}



/* ─── Action Cards ──────────────────────────────────────────── */
.alpheratz-root .action-cards-grid {
  display: flex;
  gap: 0.75rem;
  flex-shrink: 0;
  padding: 4px 0;
  /* hover時のbox-shadowが切れないよう上下に余白 */
}

.alpheratz-root .action-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--a-surface);
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;
  min-width: 0;
}

.alpheratz-root .action-card:hover {
  border-color: var(--a-accent-light);
  box-shadow: var(--a-shadow-sm);
  transform: translateY(-1px);
}

.alpheratz-root .action-card.cancel:hover {
  border-color: #fca5a5;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.08);
}

.alpheratz-root .action-card.cancel .action-icon {
  background: rgba(239, 68, 68, 0.08);
}

.alpheratz-root .action-card.cancel .action-icon .icon-svg {
  fill: #ef4444;
}

.alpheratz-root .action-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.alpheratz-root .action-icon .icon-svg {
  width: 18px;
  height: 18px;
  fill: var(--a-accent);
}

.alpheratz-root .action-info h3 {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--a-text);
  margin: 0;
}

.alpheratz-root .action-info p {
  font-size: 0.7rem;
  color: var(--a-text-dim);
  margin-top: 1px;
  margin-bottom: 0;
}

/* ─── Grid scroll wrapper ───────────────────────────────────── */
.alpheratz-root .grid-scroll-wrapper {
  position: relative;
  flex: 1;
  /* ラッパー自身を最大化 */
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--a-surface);
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
}

.alpheratz-root .photo-grid {
  scrollbar-width: none;
  outline: none;
  /* フォーカス時の枠線を消す */
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.alpheratz-root .photo-grid::-webkit-scrollbar {
  display: none;
}

.alpheratz-root .photo-card-wrapper {
  padding: 4px;
}

.alpheratz-root .photo-card {
  background: var(--a-surface);
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.alpheratz-root .photo-card:hover {
  border-color: var(--a-accent-light);
  box-shadow: var(--a-shadow-md);
  transform: translateY(-2px);
}

.alpheratz-root .photo-thumb-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--a-bg);
  flex-shrink: 0;
}

.alpheratz-root .photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.alpheratz-root .photo-card:hover .photo-thumb {
  transform: scale(1.05);
}

.alpheratz-root .photo-thumb-skeleton {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--a-bg) 25%, #f3f4f6 50%, var(--a-bg) 75%);
  background-size: 200% 100%;
  animation: a-shimmer 1.5s infinite;
}

@keyframes a-shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

.alpheratz-root .photo-info {
  padding: 0.6rem 0.75rem;
  flex: 1;
  min-height: 0;
}

.alpheratz-root .photo-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.35rem;
}

.alpheratz-root .photo-pill,
.alpheratz-root .photo-tag-chip,
.alpheratz-root .tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 999px;
  padding: 0.18rem 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  border: 1px solid rgba(99, 102, 241, 0.16);
  background: rgba(99, 102, 241, 0.08);
  color: var(--a-accent);
}

.alpheratz-root .photo-pill.favorite {
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.alpheratz-root .photo-tags-preview,
.alpheratz-root .tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.alpheratz-root .photo-world {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--a-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alpheratz-root .photo-date {
  font-size: 0.68rem;
  color: var(--a-text-dim);
  margin-top: 2px;
}

/* ─── Custom scrollbar ───────────────────────────────────────── */
.alpheratz-root .custom-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  /* 右端に密着 */
  bottom: 0;
  width: 10px;
  /* 掴みやすく、赤枠の範囲に合わせる */
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s;
}

.alpheratz-root .grid-area:hover .custom-scrollbar,
.alpheratz-root .custom-scrollbar.dragging {
  opacity: 1;
  pointer-events: auto;
}

.alpheratz-root .scrollbar-track {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.05);
  cursor: pointer;
}

.alpheratz-root .scrollbar-thumb {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 3px;
  background: var(--a-accent-gradient);
  cursor: grab;
  transition: transform 0.1s, box-shadow 0.2s;
  min-height: 28px;
}

.alpheratz-root .scrollbar-thumb:hover,
.alpheratz-root .scrollbar-thumb.dragging {
  transform: scaleX(1.4);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
  cursor: grabbing;
}

/* ─── Scroll month indicator ─────────────────────────────────── */
.alpheratz-root .scroll-month-indicator {
  position: absolute;
  right: 16px;
  background: white;
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--a-accent);
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  pointer-events: none;
  transform: translateX(4px);
  transition: top 0.1s;
  z-index: 21;
  opacity: 0;
}

.alpheratz-root .grid-area:hover .scroll-month-indicator {
  opacity: 1;
}

/* ─── Overlay / Scanner ─────────────────────────────────────── */
.alpheratz-root .overlay-loader {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.alpheratz-root .loader-content {
  text-align: center;
  max-width: 360px;
}

.alpheratz-root .loader-content h3 {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 1rem;
}

.alpheratz-root .spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--a-border);
  border-top-color: var(--a-accent);
  border-radius: 50%;
  animation: a-spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes a-spin {
  to {
    transform: rotate(360deg);
  }
}

.alpheratz-root .progress-container {
  margin-top: 0.75rem;
}

.alpheratz-root .progress-bar {
  height: 6px;
  background: var(--a-bg);
  border-radius: 999px;
  overflow: hidden;
}

.alpheratz-root .progress-fill {
  height: 100%;
  background: var(--a-accent-gradient);
  border-radius: 999px;
  transition: width 0.3s;
}

.alpheratz-root .progress-text {
  font-size: 0.75rem;
  color: var(--a-text-dim);
  margin-top: 0.4rem;
}

.alpheratz-root .current-world {
  opacity: 0.7;
}

.alpheratz-root .cancel-button-overlay {
  margin-top: 2rem;
  padding: 0.6rem 1.5rem;
  background: white;
  border: 1.5px solid #fca5a5;
  border-radius: 12px;
  color: #ef4444;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.alpheratz-root .cancel-button-overlay:hover {
  background: #fef2f2;
  border-color: #ef4444;
  transform: translateY(-1px);
}

/* ─── Empty State ───────────────────────────────────────────── */
.alpheratz-root .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.5rem;
  color: var(--a-text-dim);
}

.alpheratz-root .empty-icon {
  font-size: 2.5rem;
}

.alpheratz-root .empty-state h3 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--a-text);
  margin: 0;
}

.alpheratz-root .empty-state p {
  font-size: 0.85rem;
  margin: 0;
}

/* ─── Modal ─────────────────────────────────────────────────── */
.alpheratz-root .modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 2rem;
  animation: a-modal-fade-in 0.3s ease-out forwards;
}

@keyframes a-modal-fade-in {
  from {
    background: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0);
  }

  to {
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
  }
}

.alpheratz-root .modal-content {
  background: var(--a-surface);
  border-radius: 20px;
  max-width: 960px;
  width: 100%;
  max-height: 85vh;
  overflow: hidden;
  position: relative;
  box-shadow: var(--a-shadow-lg);
  animation: a-modal-show 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes a-modal-show {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.alpheratz-root .modal-content.settings-panel {
  max-width: 520px;
}

.alpheratz-root .modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--a-bg);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.2s;
}

.alpheratz-root .modal-close:hover {
  background: var(--a-border);
}

.alpheratz-root .modal-body {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  max-height: 85vh;
  overflow-y: auto;
}

.alpheratz-root .modal-image-container {
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 85vh;
}

.alpheratz-root .modal-image-container img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.alpheratz-root .modal-info {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.alpheratz-root .info-header h2 {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
}

.alpheratz-root .info-meta {
  margin-top: 0.25rem;
}

.alpheratz-root .timestamp {
  font-size: 0.78rem;
  color: var(--a-text-dim);
}

/* ─── World Link ─────────────────────────────────────────────── */
.alpheratz-root .world-link-section {
  display: flex;
}

.alpheratz-root .world-link-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  color: var(--a-accent);
  font-size: 0.8rem;
  font-weight: 600;
  font-family: var(--a-font-sans);
  cursor: pointer;
  transition: all 0.2s;
}

.alpheratz-root .world-link-button:hover {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--a-accent-light);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.alpheratz-root .world-link-button.favorite-active {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.28);
  color: #b45309;
}

.alpheratz-root .world-link-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.alpheratz-root .world-link-external {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.6;
}

.alpheratz-root .memo-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.alpheratz-root .memo-section label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--a-text-dim);
}

.alpheratz-root .memo-section textarea {
  border: 1px solid var(--a-border);
  border-radius: 12px;
  padding: 0.75rem;
  font-size: 0.85rem;
  resize: vertical;
  min-height: 80px;
  outline: none;
  font-family: var(--a-font-sans);
  transition: border-color 0.2s;
}

.alpheratz-root .memo-section textarea:focus {
  border-color: var(--a-accent-light);
}

.alpheratz-root .tag-editor {
  display: flex;
  gap: 0.5rem;
}

.alpheratz-root .tag-editor input {
  flex: 1;
  border: 1px solid var(--a-border);
  border-radius: 12px;
  padding: 0.75rem;
  font-size: 0.85rem;
  background: var(--a-surface);
}

.alpheratz-root .tag-chip {
  cursor: pointer;
  background: rgba(99, 102, 241, 0.08);
}

.alpheratz-root .save-button {
  padding: 0.6rem 1.2rem;
  background: var(--a-accent-gradient);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  align-self: flex-start;
}

.alpheratz-root .save-button:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.alpheratz-root .save-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* ─── Toasts ────────────────────────────────────────────────── */
.alpheratz-root .toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 300;
}

.alpheratz-root .toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--a-surface);
  border: 1px solid var(--a-border);
  border-radius: 12px;
  box-shadow: var(--a-shadow-md);
  font-size: 0.82rem;
  animation: a-toast-in 0.3s ease-out;
}

@keyframes a-toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.alpheratz-root .toast-icon {
  font-size: 1rem;
}

.alpheratz-root .toast-msg {
  color: var(--a-text);
}

/* PhotoModal Overrides */
.alpheratz-root .modal-content.photo-modal {
  max-width: 92vw;
  max-height: 92vh;
  height: 92vh;
  display: flex;
  flex-direction: column;
}

.alpheratz-root .modal-body.photo-modal-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  max-height: none;
  /* override grid max-height */
}

@media (max-width: 800px) {
  .alpheratz-root .modal-body.photo-modal-body {
    flex-direction: column;
    overflow-y: auto;
  }

  .alpheratz-root .modal-image-container.photo-modal-image {
    max-height: 50vh;
  }

  .alpheratz-root .modal-info.photo-modal-info {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--a-border);
  }
}

.alpheratz-root .modal-image-container.photo-modal-image {
  flex: 1;
  min-width: 0;
  max-height: none;
  background: #000;
}

.alpheratz-root .modal-image-container.photo-modal-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.alpheratz-root .modal-info.photo-modal-info {
  width: 380px;
  flex-shrink: 0;
  border-left: 1px solid var(--a-border);
  background: var(--a-surface);
  overflow-y: auto;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
```

---

## FILE: App.tsx

`$ext
import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

// Hooks
import { usePhotos } from "./hooks/usePhotos";
import { useScan } from "./hooks/useScan";
import { useGridDimensions } from "./hooks/useGridDimensions";
import { useScroll } from "./hooks/useScroll";
import { useMonthGroups } from "./hooks/useMonthGroups";
import { useToasts } from "./hooks/useToasts";
import { usePhotoActions } from "./hooks/usePhotoActions";

// Components
import { Header } from "./components/Header";
import { MonthNav } from "./components/MonthNav";
import { ActionCards } from "./components/ActionCards";
import { PhotoGrid } from "./components/PhotoGrid";
import { PhotoModal } from "./components/PhotoModal";
import { SettingsModal } from "./components/SettingsModal";
import { FilterSidebar } from "./components/FilterSidebar";

import { ScanningOverlay } from "./components/ScanningOverlay";
import { EmptyState } from "./components/EmptyState";

const CARD_WIDTH = 270;
const ROW_HEIGHT = 246;

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [worldFilter, setWorldFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orientationFilter, setOrientationFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({});

  // --- Search Debounce ---
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // --- Logic Extraction via Hooks ---
  const { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount } = useGridDimensions(CARD_WIDTH);
  const { toasts, addToast } = useToasts();
  const { photos, setPhotos, loadPhotos, isLoading } = usePhotos(debouncedQuery, worldFilter);
  const { scanStatus, scanProgress, photoFolderPath, startScan, refreshSettings, cancelScan } = useScan(addToast);

  const {
    selectedPhoto, closePhotoModal, photoHistory, goBackPhoto, localMemo, setLocalMemo, isSavingMemo,
    handleSaveMemo, onSelectPhoto
  } = usePhotoActions(setPhotos, addToast);

  const enrichedPhotos = useMemo(() => photos.map((photo) => {
    const match = photo.photo_filename.match(/_(\d+)x(\d+)\./i);
    let orientation: "portrait" | "landscape" | "square" | "unknown" = "unknown";
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > height) orientation = "landscape";
      else if (height > width) orientation = "portrait";
      else orientation = "square";
    }

    return {
      ...photo,
      isFavorite: Boolean(favoriteMap[photo.photo_filename]),
      tags: tagMap[photo.photo_filename] || [],
      orientation,
    };
  }), [photos, favoriteMap, tagMap]);

  const filteredPhotos = useMemo(() => enrichedPhotos.filter((photo) => {
    if (favoritesOnly && !photo.isFavorite) return false;
    if (orientationFilter !== "all" && photo.orientation !== orientationFilter) return false;
    if (dateFrom && photo.timestamp.slice(0, 10) < dateFrom) return false;
    if (dateTo && photo.timestamp.slice(0, 10) > dateTo) return false;
    if (tagQuery) {
      const query = tagQuery.trim().toLowerCase();
      if (query && !photo.tags?.some((tag) => tag.toLowerCase().includes(query))) return false;
    }
    return true;
  }), [enrichedPhotos, favoritesOnly, orientationFilter, dateFrom, dateTo, tagQuery]);

  const selectedPhotoView = useMemo(() => {
    if (!selectedPhoto) return null;
    return filteredPhotos.find((photo) => photo.photo_filename === selectedPhoto.photo_filename)
      ?? enrichedPhotos.find((photo) => photo.photo_filename === selectedPhoto.photo_filename)
      ?? selectedPhoto;
  }, [selectedPhoto, filteredPhotos, enrichedPhotos]);

  const toggleFavorite = (filename: string) => {
    setFavoriteMap((prev) => ({ ...prev, [filename]: !prev[filename] }));
  };

  const addTag = (filename: string, tag: string) => {
    setTagMap((prev) => {
      const current = prev[filename] || [];
      if (current.includes(tag)) return prev;
      return { ...prev, [filename]: [...current, tag] };
    });
  };

  const removeTag = (filename: string, tag: string) => {
    setTagMap((prev) => ({
      ...prev,
      [filename]: (prev[filename] || []).filter((item) => item !== tag),
    }));
  };

  const resetFilters = () => {
    setWorldFilter("all");
    setDateFrom("");
    setDateTo("");
    setOrientationFilter("all");
    setFavoritesOnly(false);
    setTagQuery("");
  };

  const {
    scrollTop, thumbTop, thumbHeight, isDragging, totalHeight, onGridRef,
    handleGridScroll, handleScrollbarMouseDown, handleTrackClick, handleJumpToRow
  } = useScroll({ photosLength: filteredPhotos.length, columnCount, gridHeight, ROW_HEIGHT });

  const { monthGroups, monthsByYear, activeMonthIndex } = useMonthGroups(filteredPhotos, columnCount, scrollTop, ROW_HEIGHT);

  const handleChooseFolder = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      const newPath = Array.isArray(selected) ? selected[0] : selected;
      await invoke("save_setting_cmd", { setting: { photoFolderPath: newPath } });
      await refreshSettings();
      await startScan();
      await loadPhotos();
    }
  };

  const worldNameList = useMemo(() => Array.from(new Set(photos.map((p) => p.world_name || ""))).sort(), [photos]);
  const cellProps = useMemo(() => ({ data: filteredPhotos, onSelect: onSelectPhoto, columnCount }), [filteredPhotos, onSelectPhoto, columnCount]);
  const totalRows = Math.ceil(filteredPhotos.length / columnCount);

  return (
    <div className="alpheratz-root">
      <Header
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
      />

      <main className="main-content">
        {scanStatus === "scanning" && <ScanningOverlay progress={scanProgress} onCancel={cancelScan} />}

        <div className="grid-area">
          <FilterSidebar
            isOpen={isFilterOpen}
            worldFilter={worldFilter}
            setWorldFilter={setWorldFilter}
            worldNameList={worldNameList}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            orientationFilter={orientationFilter}
            setOrientationFilter={setOrientationFilter}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            tagQuery={tagQuery}
            setTagQuery={setTagQuery}
            onReset={resetFilters}
          />
          <MonthNav monthsByYear={monthsByYear} monthGroups={monthGroups} activeMonthIndex={activeMonthIndex} handleJumpToMonth={(g) => handleJumpToRow(g.rowIndex)} />

          <div className="right-panel" ref={rightPanelRef}>
            <ActionCards
              startScan={startScan}
              cancelScan={cancelScan}
              scanStatus={scanStatus}
              setShowSettings={setShowSettings}
              setIsFilterOpen={setIsFilterOpen}
            />

            {(scanStatus !== "scanning" && !isLoading && filteredPhotos.length === 0) && (
              <EmptyState isFiltering={!!searchQuery || worldFilter !== "all" || !!dateFrom || !!dateTo || favoritesOnly || !!tagQuery || orientationFilter !== "all"} />
            )}

            <div ref={gridWrapperRef} style={{ flex: 1, minHeight: 0 }}>
              <PhotoGrid
                photos={filteredPhotos} columnCount={columnCount} CARD_WIDTH={CARD_WIDTH} totalRows={totalRows} ROW_HEIGHT={ROW_HEIGHT}
                gridHeight={gridHeight} panelWidth={panelWidth} handleGridScroll={handleGridScroll} isDragging={isDragging}
                thumbTop={thumbTop} thumbHeight={thumbHeight} handleTrackClick={handleTrackClick} handleScrollbarMouseDown={handleScrollbarMouseDown}
                monthGroups={monthGroups} activeMonthIndex={activeMonthIndex} totalHeight={totalHeight} cellProps={cellProps}
                onGridRef={onGridRef}
              />
            </div>
          </div>
        </div>
      </main>

      {selectedPhotoView && (
        <PhotoModal
          photo={selectedPhotoView} onClose={closePhotoModal}
          localMemo={localMemo} setLocalMemo={setLocalMemo}
          handleSaveMemo={handleSaveMemo} isSavingMemo={isSavingMemo}
          allPhotos={enrichedPhotos}
          onSelectSimilar={(p) => onSelectPhoto(p, true)}
          canGoBack={photoHistory.length > 0}
          onGoBack={goBackPhoto}
          onToggleFavorite={() => toggleFavorite(selectedPhotoView.photo_filename)}
          onAddTag={(tag) => addTag(selectedPhotoView.photo_filename, tag)}
          onRemoveTag={(tag) => removeTag(selectedPhotoView.photo_filename, tag)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          photoFolderPath={photoFolderPath} handleChooseFolder={handleChooseFolder}
        />
      )}

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <div className="toast-icon">★</div>
            <div className="toast-msg">{t.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
```

---

## FILE: assets\react.svg

`$ext
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--logos" width="35.93" height="32" preserveAspectRatio="xMidYMid meet" viewBox="0 0 256 228"><path fill="#00D8FF" d="M210.483 73.824a171.49 171.49 0 0 0-8.24-2.597c.465-1.9.893-3.777 1.273-5.621c6.238-30.281 2.16-54.676-11.769-62.708c-13.355-7.7-35.196.329-57.254 19.526a171.23 171.23 0 0 0-6.375 5.848a155.866 155.866 0 0 0-4.241-3.917C100.759 3.829 77.587-4.822 63.673 3.233C50.33 10.957 46.379 33.89 51.995 62.588a170.974 170.974 0 0 0 1.892 8.48c-3.28.932-6.445 1.924-9.474 2.98C17.309 83.498 0 98.307 0 113.668c0 15.865 18.582 31.778 46.812 41.427a145.52 145.52 0 0 0 6.921 2.165a167.467 167.467 0 0 0-2.01 9.138c-5.354 28.2-1.173 50.591 12.134 58.266c13.744 7.926 36.812-.22 59.273-19.855a145.567 145.567 0 0 0 5.342-4.923a168.064 168.064 0 0 0 6.92 6.314c21.758 18.722 43.246 26.282 56.54 18.586c13.731-7.949 18.194-32.003 12.4-61.268a145.016 145.016 0 0 0-1.535-6.842c1.62-.48 3.21-.974 4.76-1.488c29.348-9.723 48.443-25.443 48.443-41.52c0-15.417-17.868-30.326-45.517-39.844Zm-6.365 70.984c-1.4.463-2.836.91-4.3 1.345c-3.24-10.257-7.612-21.163-12.963-32.432c5.106-11 9.31-21.767 12.459-31.957c2.619.758 5.16 1.557 7.61 2.4c23.69 8.156 38.14 20.213 38.14 29.504c0 9.896-15.606 22.743-40.946 31.14Zm-10.514 20.834c2.562 12.94 2.927 24.64 1.23 33.787c-1.524 8.219-4.59 13.698-8.382 15.893c-8.067 4.67-25.32-1.4-43.927-17.412a156.726 156.726 0 0 1-6.437-5.87c7.214-7.889 14.423-17.06 21.459-27.246c12.376-1.098 24.068-2.894 34.671-5.345a134.17 134.17 0 0 1 1.386 6.193ZM87.276 214.515c-7.882 2.783-14.16 2.863-17.955.675c-8.075-4.657-11.432-22.636-6.853-46.752a156.923 156.923 0 0 1 1.869-8.499c10.486 2.32 22.093 3.988 34.498 4.994c7.084 9.967 14.501 19.128 21.976 27.15a134.668 134.668 0 0 1-4.877 4.492c-9.933 8.682-19.886 14.842-28.658 17.94ZM50.35 144.747c-12.483-4.267-22.792-9.812-29.858-15.863c-6.35-5.437-9.555-10.836-9.555-15.216c0-9.322 13.897-21.212 37.076-29.293c2.813-.98 5.757-1.905 8.812-2.773c3.204 10.42 7.406 21.315 12.477 32.332c-5.137 11.18-9.399 22.249-12.634 32.792a134.718 134.718 0 0 1-6.318-1.979Zm12.378-84.26c-4.811-24.587-1.616-43.134 6.425-47.789c8.564-4.958 27.502 2.111 47.463 19.835a144.318 144.318 0 0 1 3.841 3.545c-7.438 7.987-14.787 17.08-21.808 26.988c-12.04 1.116-23.565 2.908-34.161 5.309a160.342 160.342 0 0 1-1.76-7.887Zm110.427 27.268a347.8 347.8 0 0 0-7.785-12.803c8.168 1.033 15.994 2.404 23.343 4.08c-2.206 7.072-4.956 14.465-8.193 22.045a381.151 381.151 0 0 0-7.365-13.322Zm-45.032-43.861c5.044 5.465 10.096 11.566 15.065 18.186a322.04 322.04 0 0 0-30.257-.006c4.974-6.559 10.069-12.652 15.192-18.18ZM82.802 87.83a323.167 323.167 0 0 0-7.227 13.238c-3.184-7.553-5.909-14.98-8.134-22.152c7.304-1.634 15.093-2.97 23.209-3.984a321.524 321.524 0 0 0-7.848 12.897Zm8.081 65.352c-8.385-.936-16.291-2.203-23.593-3.793c2.26-7.3 5.045-14.885 8.298-22.6a321.187 321.187 0 0 0 7.257 13.246c2.594 4.48 5.28 8.868 8.038 13.147Zm37.542 31.03c-5.184-5.592-10.354-11.779-15.403-18.433c4.902.192 9.899.29 14.978.29c5.218 0 10.376-.117 15.453-.343c-4.985 6.774-10.018 12.97-15.028 18.486Zm52.198-57.817c3.422 7.8 6.306 15.345 8.596 22.52c-7.422 1.694-15.436 3.058-23.88 4.071a382.417 382.417 0 0 0 7.859-13.026a347.403 347.403 0 0 0 7.425-13.565Zm-16.898 8.101a358.557 358.557 0 0 1-12.281 19.815a329.4 329.4 0 0 1-23.444.823c-7.967 0-15.716-.248-23.178-.732a310.202 310.202 0 0 1-12.513-19.846h.001a307.41 307.41 0 0 1-10.923-20.627a310.278 310.278 0 0 1 10.89-20.637l-.001.001a307.318 307.318 0 0 1 12.413-19.761c7.613-.576 15.42-.876 23.31-.876H128c7.926 0 15.743.303 23.354.883a329.357 329.357 0 0 1 12.335 19.695a358.489 358.489 0 0 1 11.036 20.54a329.472 329.472 0 0 1-11 20.722Zm22.56-122.124c8.572 4.944 11.906 24.881 6.52 51.026c-.344 1.668-.73 3.367-1.15 5.09c-10.622-2.452-22.155-4.275-34.23-5.408c-7.034-10.017-14.323-19.124-21.64-27.008a160.789 160.789 0 0 1 5.888-5.4c18.9-16.447 36.564-22.941 44.612-18.3ZM128 90.808c12.625 0 22.86 10.235 22.86 22.86s-10.235 22.86-22.86 22.86s-22.86-10.235-22.86-22.86s10.235-22.86 22.86-22.86Z"></path></svg>
```

---

## FILE: components\ActionCards.tsx

`$ext
import { Icons } from "./Icons";

interface ActionCardsProps {
    startScan: () => void;
    cancelScan: () => void;
    scanStatus: string;
    setShowSettings: (val: boolean) => void;
    setIsFilterOpen: (val: boolean) => void;
}

export const ActionCards = ({
    startScan,
    cancelScan,
    scanStatus,
    setShowSettings,
    setIsFilterOpen,
}: ActionCardsProps) => {
    return (
        <div className="action-cards-grid">
            {scanStatus === "scanning" ? (
                <div className="action-card cancel" onClick={cancelScan}>
                    <div className="action-icon"><Icons.Close /></div>
                    <div className="action-info"><h3>Cancel</h3><p>スキャンを中断</p></div>
                </div>
            ) : (
                <div className="action-card" onClick={startScan}>
                    <div className="action-icon"><Icons.Refresh /></div>
                    <div className="action-info"><h3>Refresh</h3><p>写真を再スキャン</p></div>
                </div>
            )}
            <div className="action-card" onClick={() => setShowSettings(true)}>
                <div className="action-icon"><Icons.Settings /></div>
                <div className="action-info"><h3>Settings</h3><p>フォルダ設定</p></div>
            </div>
            <div className="action-card" onClick={() => setIsFilterOpen(true)}>
                <div className="action-icon"><Icons.Search /></div>
                <div className="action-info"><h3>Filter</h3><p>条件検索を開く</p></div>
            </div>
        </div>
    );
};
```

---

## FILE: components\CustomScrollbar.tsx

`$ext
import { MouseEvent } from "react";
import { MonthGroup } from "../types";

interface CustomScrollbarProps {
    isDragging: boolean;
    thumbTop: number;
    thumbHeight: number;
    handleTrackClick: (e: MouseEvent<HTMLDivElement>) => void;
    handleScrollbarMouseDown: (e: MouseEvent) => void;
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
}

export const CustomScrollbar = ({
    isDragging,
    thumbTop,
    thumbHeight,
    handleTrackClick,
    handleScrollbarMouseDown,
    monthGroups,
    activeMonthIndex,
}: CustomScrollbarProps) => {
    return (
        <div className={`custom-scrollbar ${isDragging ? "dragging" : ""}`}>
            <div className="scrollbar-track" onClick={handleTrackClick}>
                <div
                    className={`scrollbar-thumb ${isDragging ? "dragging" : ""}`}
                    style={{ top: thumbTop, height: thumbHeight }}
                    onMouseDown={handleScrollbarMouseDown}
                />
            </div>
            <div className="scroll-month-indicator" style={{ top: Math.max(0, thumbTop - 10) }}>
                {monthGroups[activeMonthIndex]
                    ? `${monthGroups[activeMonthIndex].year}年${monthGroups[activeMonthIndex].month}月`
                    : ""}
            </div>
        </div>
    );
};
```

---

## FILE: components\EmptyState.tsx

`$ext
interface EmptyStateProps {
    isFiltering: boolean;
}

export const EmptyState = ({ isFiltering }: EmptyStateProps) => {
    return (
        <div className="empty-state">
            <div className="empty-icon-wrapper">
                {isFiltering ? (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                ) : (
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                )}
            </div>
            <h3>{isFiltering ? "検索結果が見つかりません" : "写真が見つかりません"}</h3>
            <p>{isFiltering ? "検索条件を変えてみてください。" : "フォルダ設定を確認してください。"}</p>
        </div>
    );
};
```

---

## FILE: components\FilterSidebar.tsx

`$ext
interface FilterSidebarProps {
    isOpen: boolean;
    worldFilter: string;
    setWorldFilter: (val: string) => void;
    worldNameList: string[];
    dateFrom: string;
    setDateFrom: (val: string) => void;
    dateTo: string;
    setDateTo: (val: string) => void;
    orientationFilter: string;
    setOrientationFilter: (val: string) => void;
    favoritesOnly: boolean;
    setFavoritesOnly: (val: boolean) => void;
    tagQuery: string;
    setTagQuery: (val: string) => void;
    onReset: () => void;
}

export const FilterSidebar = ({
    isOpen,
    worldFilter,
    setWorldFilter,
    worldNameList,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    orientationFilter,
    setOrientationFilter,
    favoritesOnly,
    setFavoritesOnly,
    tagQuery,
    setTagQuery,
    onReset,
}: FilterSidebarProps) => {
    return (
        <aside className={`filter-sidebar ${isOpen ? "open" : ""}`}>
            <div className="filter-sidebar-header">
                <h3>条件検索</h3>
                <button className="filter-reset-button" onClick={onReset}>
                    リセット
                </button>
            </div>

            <div className="filter-section">
                <label>ワールド</label>
                <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)}>
                    <option value="all">すべてのワールド</option>
                    {worldNameList.map((name) => (
                        <option key={name || "unknown"} value={name || "unknown"}>
                            {name || "ワールド不明"}
                        </option>
                    ))}
                </select>
            </div>

            <div className="filter-section">
                <label>撮影日 From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="filter-section">
                <label>撮影日 To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="filter-section">
                <label>縦横向き</label>
                <select value={orientationFilter} onChange={(e) => setOrientationFilter(e.target.value)}>
                    <option value="all">すべて</option>
                    <option value="portrait">縦長</option>
                    <option value="landscape">横長</option>
                    <option value="square">正方形</option>
                    <option value="unknown">不明</option>
                </select>
            </div>

            <div className="filter-section">
                <label>タグ検索</label>
                <input
                    type="text"
                    value={tagQuery}
                    placeholder="タグ名を入力"
                    onChange={(e) => setTagQuery(e.target.value)}
                />
            </div>

            <div className="filter-section checkbox">
                <label>
                    <input
                        type="checkbox"
                        checked={favoritesOnly}
                        onChange={(e) => setFavoritesOnly(e.target.checked)}
                    />
                    お気に入りのみ
                </label>
            </div>

            <p className="filter-note">
                タグとお気に入りは簡易実装です。現在はセッション中のテスト用途として動作します。
            </p>
        </aside>
    );
};
```

---

## FILE: components\Header.tsx

`$ext
import { Icons } from "./Icons";

interface HeaderProps {
    isFilterOpen: boolean;
    setIsFilterOpen: (val: boolean) => void;
    searchQuery: string;
    setSearchQuery: (val: string) => void;
}

export const Header = ({
    isFilterOpen,
    setIsFilterOpen,
    searchQuery,
    setSearchQuery,
}: HeaderProps) => {
    return (
        <header className="header">
            <div className="logo-group">
                <button
                    className={`menu-button ${isFilterOpen ? "active" : ""}`}
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    aria-label="検索サイドバーを切り替え"
                >
                    <Icons.Menu />
                </button>
                <img src="/Alpheratz-logo.png" alt="Alpheratz" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
            </div>
            <div className="search-bar">
                <div className="input-group">
                    <Icons.Search />
                    <input
                        type="text"
                        placeholder="ワールド名で検索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
        </header>
    );
};
```

---

## FILE: components\Icons.tsx

`$ext


export const Icons = {
    Menu: () => (
        <svg viewBox="0 0 24 24" className="icon-svg"><path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" /></svg>
    ),
    Refresh: () => (
        <svg viewBox="0 0 24 24" className="icon-svg"><path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z" /></svg>
    ),
    Settings: () => (
        <svg viewBox="0 0 24 24" className="icon-svg"><path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.35 19.43,11.03L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.97 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.32 14.87,5.07L14.49,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.51,2.42L9.13,5.07C8.53,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.97 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11.03C4.53,11.35 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.95C7.96,18.34 8.53,18.68 9.13,18.93L9.51,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.49,21.58L14.87,18.93C15.47,18.68 16.04,18.34 16.56,17.95L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" /></svg>
    ),
    Search: () => (
        <svg viewBox="0 0 24 24" className="icon-svg"><path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" /></svg>
    ),
    Link: () => (
        <svg viewBox="0 0 24 24" className="icon-svg"><path d="M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z" /></svg>
    ),
    Close: () => (
        <svg viewBox="0 0 24 24" className="icon-svg"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>
    ),
};
```

---

## FILE: components\MonthNav.tsx

`$ext
import { MonthGroup } from "../types";

interface MonthNavProps {
    monthsByYear: [number, MonthGroup[]][];
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
    handleJumpToMonth: (group: MonthGroup) => void;
}

export const MonthNav = ({
    monthsByYear,
    monthGroups,
    activeMonthIndex,
    handleJumpToMonth,
}: MonthNavProps) => {
    return (
        <nav className="month-nav">
            {monthsByYear.map(([year, months]) => (
                <div key={year}>
                    <div className="month-nav-year">{year}</div>
                    {months.map((g) => {
                        const globalIndex = monthGroups.indexOf(g);
                        return (
                            <div
                                key={g.key}
                                className={`month-nav-item ${globalIndex === activeMonthIndex ? "active" : ""}`}
                                onClick={() => handleJumpToMonth(g)}
                            >
                                <span className="month-nav-dot" />
                                <div className="month-nav-label">
                                    <span className="month-nav-name">{g.label}</span>
                                    <span className="month-nav-count">{g.count}枚</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
};
```

---

## FILE: components\PhotoCard.tsx

`$ext
import { useState, useEffect, CSSProperties } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Photo } from "../types";

interface PhotoCardProps {
    data: Photo[];
    onSelect: (photo: Photo) => void;
    columnCount: number;
    columnIndex: number;
    rowIndex: number;
    style: CSSProperties;
}

export const PhotoCard = ({
    data, onSelect, columnCount, columnIndex, rowIndex, style,
}: PhotoCardProps) => {
    const index = rowIndex * columnCount + columnIndex;
    const photo = data[index];
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!photo) return;
        let isMounted = true;
        invoke<string>("create_thumbnail", { path: photo.photo_path })
            .then((path) => { if (isMounted) setThumbUrl(convertFileSrc(path)); })
            .catch((err) => console.error("Thumbnail error:", err));
        return () => { isMounted = false; };
    }, [photo?.photo_path]);

    if (!photo) return null;

    return (
        <div style={style} className="photo-card-wrapper" onClick={() => onSelect(photo)}>
            <div className="photo-card">
                <div className="photo-thumb-container">
                    {thumbUrl
                        ? <img src={thumbUrl} alt={photo.photo_filename} className="photo-thumb" />
                        : <div className="photo-thumb-skeleton" />
                    }
                </div>
                <div className="photo-info">
                    <div className="photo-meta-row">
                        {photo.isFavorite && <span className="photo-pill favorite">★ Favorite</span>}
                        {photo.orientation && photo.orientation !== "unknown" && (
                            <span className="photo-pill">{photo.orientation}</span>
                        )}
                    </div>
                    <div className="photo-world">{photo.world_name || "ワールド不明"}</div>
                    <div className="photo-date">{photo.timestamp}</div>
                    {!!photo.tags?.length && (
                        <div className="photo-tags-preview">
                            {photo.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="photo-tag-chip">{tag}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
```

---

## FILE: components\PhotoGrid.tsx

`$ext
import { UIEvent, MouseEvent } from "react";
import { Grid as FixedSizeGrid } from "react-window";
import { Photo, MonthGroup } from "../types";
import { PhotoCard } from "./PhotoCard";
import { CustomScrollbar } from "./CustomScrollbar";

interface PhotoGridProps {
    photos: Photo[];
    columnCount: number;
    CARD_WIDTH: number;
    totalRows: number;
    ROW_HEIGHT: number;
    gridHeight: number;
    panelWidth: number;
    handleGridScroll: (e: UIEvent<HTMLDivElement>) => void;
    isDragging: boolean;
    thumbTop: number;
    thumbHeight: number;
    handleTrackClick: (e: MouseEvent<HTMLDivElement>) => void;
    handleScrollbarMouseDown: (e: MouseEvent) => void;
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
    totalHeight: number;
    cellProps: any;
    onGridRef: (node: HTMLDivElement | null) => void;
}

const FixedSizeGridComponent = FixedSizeGrid as any;

export const PhotoGrid = ({
    photos,
    columnCount,
    CARD_WIDTH,
    totalRows,
    ROW_HEIGHT,
    gridHeight,
    panelWidth,
    handleGridScroll,
    isDragging,
    thumbTop,
    thumbHeight,
    handleTrackClick,
    handleScrollbarMouseDown,
    monthGroups,
    activeMonthIndex,
    totalHeight,
    cellProps,
    onGridRef,
}: PhotoGridProps) => {
    return (
        <div className="grid-scroll-wrapper">
            {photos.length > 0 && (
                <>
                    <FixedSizeGridComponent
                        columnCount={columnCount}
                        columnWidth={CARD_WIDTH}
                        rowCount={totalRows}
                        rowHeight={ROW_HEIGHT}
                        cellComponent={PhotoCard as any}
                        cellProps={cellProps}
                        onScroll={handleGridScroll}
                        outerRef={onGridRef}
                        style={{ height: gridHeight, width: panelWidth }}
                        className="photo-grid"
                    />
                    {totalHeight > gridHeight && (
                        <CustomScrollbar
                            isDragging={isDragging}
                            thumbTop={thumbTop}
                            thumbHeight={thumbHeight}
                            handleTrackClick={handleTrackClick}
                            handleScrollbarMouseDown={handleScrollbarMouseDown as any}
                            monthGroups={monthGroups}
                            activeMonthIndex={activeMonthIndex}
                        />
                    )}
                </>
            )}
        </div>
    );
};
```

---

## FILE: components\PhotoModal.tsx

`$ext
import { KeyboardEvent, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";
import { Icons } from "./Icons";

interface PhotoModalProps {
    photo: Photo;
    onClose: () => void;
    localMemo: string;
    setLocalMemo: (val: string) => void;
    handleSaveMemo: () => void;
    isSavingMemo: boolean;
    allPhotos: Photo[];
    onSelectSimilar: (photo: Photo) => void;
    canGoBack?: boolean;
    onGoBack?: () => void;
    onToggleFavorite: () => void;
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;
}

const POPCNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    let count = 0;
    let n = i;
    while (n > 0) {
        count += n & 1;
        n >>= 1;
    }
    POPCNT_TABLE[i] = count;
}

function base64ToBytes(base64: string): Uint8Array | null {
    try {
        const binString = atob(base64);
        return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    } catch {
        return null;
    }
}

const MAX_SUGGESTIONS = 5;
const MAX_MAYBE_SUGGESTIONS = 3;
type SimilarPhotoEntry = { item: Photo; distance: number };
type WorldSuggestion = { world_id: string; world_name: string; min_dist: number; photo: Photo };

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
    let dist = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        dist += POPCNT_TABLE[a[i] ^ b[i]];
    }
    return dist;
}

function buildWorldSuggestions(
    similarPhotos: SimilarPhotoEntry[],
    unknownWorld: boolean,
    opts: {
        limit: number;
        filter: (entry: SimilarPhotoEntry) => boolean;
        requireNonEmpty?: boolean;
    }
): WorldSuggestion[] {
    if (!unknownWorld || (opts.requireNonEmpty && similarPhotos.length === 0)) return [];

    const knowns = similarPhotos.filter(
        (entry) => entry.item.world_id && entry.item.world_name && opts.filter(entry)
    );
    const map = new Map<string, WorldSuggestion>();
    for (const entry of knowns) {
        const wid = entry.item.world_id as string;
        const current = map.get(wid);
        if (!current || current.min_dist > entry.distance) {
            map.set(wid, {
                world_id: wid,
                world_name: entry.item.world_name ?? "不明",
                min_dist: entry.distance,
                photo: entry.item,
            });
        }
    }
    return Array.from(map.values())
        .sort((a, b) => a.min_dist - b.min_dist)
        .slice(0, opts.limit);
}

export const PhotoModal = ({
    photo,
    onClose,
    localMemo,
    setLocalMemo,
    handleSaveMemo,
    isSavingMemo,
    allPhotos,
    onSelectSimilar,
    canGoBack,
    onGoBack,
    onToggleFavorite,
    onAddTag,
    onRemoveTag,
}: PhotoModalProps) => {
    const unknownWorld = !photo.world_id;
    const [tagDraft, setTagDraft] = useState("");

    const [similarPhotos, setSimilarPhotos] = useState<SimilarPhotoEntry[]>([]);
    const [isSearchingSimilar, setIsSearchingSimilar] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearchSimilar = async () => {
        setIsSearchingSimilar(true);
        setHasSearched(true);

        try {
            const rotatedHashes: string[] = await invoke("get_rotated_phashes", { path: photo.photo_path });
            const allTargetHashes = rotatedHashes
                .map(base64ToBytes)
                .filter((bytes): bytes is Uint8Array => bytes !== null);

            if (allTargetHashes.length === 0) {
                return;
            }

            const results: SimilarPhotoEntry[] = [];

            for (const p of allPhotos) {
                if (p.photo_filename === photo.photo_filename || !p.phash) continue;

                const pBytes = base64ToBytes(p.phash);
                if (!pBytes) continue;
                let minDist = 64;
                for (const targetBytes of allTargetHashes) {
                    const dist = hammingDistance(targetBytes, pBytes);
                    if (dist < minDist) minDist = dist;
                }
                // 通常類似標準: 10 / 「もしかして」用緩い標準: 20
                if (minDist <= 20) {
                    results.push({ item: p, distance: minDist });
                }
            }
            results.sort((a, b) => a.distance - b.distance);
            setSimilarPhotos(results);
        } catch (err) {
            console.error("Failed to get rotated hashes:", err);
        } finally {
            setIsSearchingSimilar(false);
        }
    };

    // suggestion logic: world_idありの写真から類似ワールドを推測する
    const suggestions = useMemo(() => {
        return buildWorldSuggestions(similarPhotos, unknownWorld, {
            filter: () => true,
            limit: MAX_SUGGESTIONS,
        });
    }, [similarPhotos, unknownWorld]);

    // 「もしかして」候補: world_idなしの写真で側だからworld_idありの候補求め
    const maybeSuggestions = useMemo(() => {
        return buildWorldSuggestions(similarPhotos, unknownWorld, {
            filter: (entry) => entry.distance > 10 && entry.distance <= 20,
            limit: MAX_MAYBE_SUGGESTIONS,
            requireNonEmpty: true,
        });
    }, [similarPhotos, unknownWorld]);

    const confident = suggestions.filter(s => s.min_dist <= 6);
    const possible = suggestions.filter(s => s.min_dist > 6 && s.min_dist <= 10);

    const submitTag = () => {
        const normalized = tagDraft.trim();
        if (!normalized) return;
        onAddTag(normalized);
        setTagDraft("");
    };

    const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitTag();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
                {canGoBack && onGoBack && (
                    <button className="modal-back" onClick={onGoBack} style={{
                        position: 'absolute', top: '0.75rem', left: '0.75rem', width: '32px', height: '32px', borderRadius: '50%',
                        border: 'none', background: 'var(--a-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, transition: 'background 0.2s'
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                )}
                <button className="modal-close" onClick={onClose} aria-label="閉じる">
                    <Icons.Close />
                </button>
                <div className="modal-body photo-modal-body">
                    <div className="modal-image-container photo-modal-image" style={{ position: 'relative' }}>
                        <img src={convertFileSrc(photo.photo_path)} alt="" />
                        <div style={{
                            position: 'absolute', bottom: '8px', right: '12px', background: 'rgba(0,0,0,0.5)',
                            padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.7)',
                            pointerEvents: 'none'
                        }}>
                            {photo.photo_filename}
                        </div>
                    </div>
                    <div className="modal-info photo-modal-info">
                        <div className="info-header">
                            <h2>{photo.world_name || "ワールド不明"}</h2>
                            <div className="info-meta">
                                <span className="timestamp">{photo.timestamp}</span>
                                {photo.world_id && <span className="timestamp">World ID: {photo.world_id}</span>}
                            </div>
                        </div>
                        <div className="action-buttons-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button className={`world-link-button ${photo.isFavorite ? "favorite-active" : ""}`} onClick={onToggleFavorite}>
                                {photo.isFavorite ? "★ お気に入り解除" : "☆ お気に入り追加"}
                            </button>
                            <button className="world-link-button" onClick={() => invoke("show_in_explorer", { path: photo.photo_path })} style={{ background: 'transparent', border: '1px solid var(--a-border)', color: 'var(--a-text)' }}>
                                <svg className="world-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                エクスプローラーで表示
                            </button>
                        </div>

                        {unknownWorld && !hasSearched && (
                            <div className="suggestions-section" style={{ marginTop: '20px', padding: '16px', background: 'var(--a-bg)', borderRadius: '12px', textAlign: 'center' }}>
                                <p style={{ fontSize: '13px', color: 'var(--a-text)', marginBottom: '12px' }}>メタデータがありません。似た写真から推測しますか？</p>
                                <button className="world-link-button" onClick={handleSearchSimilar} disabled={isSearchingSimilar} style={{ width: '100%', justifyContent: 'center' }}>
                                    {isSearchingSimilar ? (
                                        <>
                                            <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255, 255, 255, 0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'a-spin 0.8s linear infinite' }} />
                                            検索中...
                                        </>
                                    ) : "類似ワールドを調べる"}
                                </button>
                            </div>
                        )}

                        {unknownWorld && hasSearched && suggestions.length > 0 && (
                            <div className="suggestions-section" style={{ marginTop: '20px', padding: '12px', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                                {confident.length > 0 ? (
                                    <>
                                        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4ade80' }}>ワールドが見つかったかも！</h3>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '13px' }}>高信頼度（距離: {confident[0].min_dist}）</p>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <img src={convertFileSrc(confident[0].photo.photo_path)} alt="" style={{ width: '80px', height: '56px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => onSelectSimilar(confident[0].photo)} />
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{confident[0].world_name}</div>
                                                <div className="timestamp" style={{ marginTop: '4px' }}>{confident[0].world_id}</div>
                                            </div>
                                        </div>
                                    </>
                                ) : possible.length > 0 ? (
                                    <>
                                        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#fbbf24' }}>雰囲気が似てるワールド</h3>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '13px' }}>近い写真から推測しました。</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {possible.map(s => (
                                                <div key={s.world_id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <img src={convertFileSrc(s.photo.photo_path)} alt="" style={{ width: '60px', height: '42px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => onSelectSimilar(s.photo)} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{s.world_name}</div>
                                                        <div className="timestamp" style={{ marginTop: '2px' }}>{s.world_id}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}

                        {/* 「もしかして」: 距離 11-20 の緩い類似候補 */}
                        {unknownWorld && hasSearched && maybeSuggestions.length > 0 && (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(251,191,36,0.07)', borderRadius: '8px', border: '1px dashed rgba(251,191,36,0.4)', marginBottom: '20px' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>📍</span> もしかして...
                                </h3>
                                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: 'var(--a-text)', opacity: 0.7 }}>
                                    雰囲気が少し似ているワールドがあります。ヒント程度にどうぞ。
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {maybeSuggestions.map(s => (
                                        <div key={s.world_id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <img src={convertFileSrc(s.photo.photo_path)} alt="" style={{ width: '52px', height: '36px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', opacity: 0.85 }} onClick={() => onSelectSimilar(s.photo)} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold', opacity: 0.9 }}>{s.world_name}</div>
                                                <div style={{ fontSize: '10px', color: 'var(--a-text)', opacity: 0.5 }}>部分一致 (dist {s.min_dist})</div>
                                            </div>
                                            <div className="timestamp" style={{ fontSize: '10px', opacity: 0.8 }}>{s.world_id}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="memo-section">
                            <label>タグ</label>
                            <div className="tag-editor">
                                <input
                                    type="text"
                                    value={tagDraft}
                                    placeholder="タグを追加"
                                    onChange={(e) => setTagDraft(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                />
                                <button className="save-button" onClick={submitTag}>追加</button>
                            </div>
                            {!!photo.tags?.length && (
                                <div className="tag-list">
                                    {photo.tags.map((tag) => (
                                        <button key={tag} className="tag-chip" onClick={() => onRemoveTag(tag)}>
                                            {tag} ×
                                        </button>
                                    ))}
                                </div>
                            )}
                            <label>メモ</label>
                            <textarea value={localMemo} onChange={(e) => setLocalMemo(e.target.value)} placeholder="メモを入力..." />
                            <button className="save-button" onClick={handleSaveMemo} disabled={isSavingMemo}>
                                {isSavingMemo ? "保存中..." : "メモを保存"}
                            </button>
                        </div>

                        {!unknownWorld && !hasSearched && (
                            <div className="suggestions-section" style={{ marginTop: '20px' }}>
                                <button className="world-link-button" onClick={handleSearchSimilar} disabled={isSearchingSimilar} style={{ width: '100%', justifyContent: 'center', background: 'transparent', border: '1px solid var(--a-border)', color: 'var(--a-text)' }}>
                                    {isSearchingSimilar ? (
                                        <>
                                            <div style={{ width: '14px', height: '14px', border: '2px solid var(--a-border)', borderTopColor: 'var(--a-accent)', borderRadius: '50%', animation: 'a-spin 0.8s linear infinite' }} />
                                            検索中...
                                        </>
                                    ) : "類似画像を調べる"}
                                </button>
                            </div>
                        )}

                        {!unknownWorld && hasSearched && similarPhotos.length > 0 && (
                            <div className="similar-photos-section" style={{ marginTop: '20px' }}>
                                <h3>類似写真 ({similarPhotos.length}件)</h3>
                                <div className="similar-photos-list" style={{
                                    display: 'flex',
                                    gap: '8px',
                                    overflowX: 'auto',
                                    paddingBottom: '8px',
                                    scrollbarWidth: 'thin'
                                }}>
                                    {similarPhotos.map(sp => (
                                        <div
                                            key={sp.item.photo_filename}
                                            style={{ flexShrink: 0, width: '100px', cursor: 'pointer', position: 'relative' }}
                                            onClick={() => onSelectSimilar(sp.item)}
                                        >
                                            <img
                                                src={convertFileSrc(sp.item.photo_path)}
                                                alt="similar"
                                                style={{ width: '100px', height: '70px', objectFit: 'cover', borderRadius: '4px' }}
                                            />
                                            <div style={{
                                                position: 'absolute', bottom: 2, right: 2,
                                                background: 'rgba(0,0,0,0.6)', color: '#fff',
                                                fontSize: '10px', padding: '2px 4px', borderRadius: '4px'
                                            }}>
                                                dist: {sp.distance}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
```

---

## FILE: components\ScanningOverlay.tsx

`$ext
import { ScanProgress } from "../types";

interface ScanningOverlayProps {
    progress: ScanProgress;
    onCancel: () => void;
}

export const ScanningOverlay = ({ progress, onCancel }: ScanningOverlayProps) => {
    return (
        <div className="overlay-loader">
            <div className="loader-content">
                <div className="spinner" />
                <h3>スキャン中...</h3>
                <div className="progress-container">
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: progress.total > 0 ? `${(progress.processed / progress.total) * 100}%` : "0%" }} />
                    </div>
                    <div className="progress-text">
                        {progress.processed} / {progress.total}
                        {progress.current_world && <span className="current-world"> — {progress.current_world}</span>}
                    </div>
                </div>
                <button className="cancel-button-overlay" onClick={onCancel}>
                    スキャンを中断
                </button>
            </div>
        </div>
    );
};
```

---

## FILE: components\SettingsModal.tsx

`$ext


interface SettingsModalProps {
    onClose: () => void;
    photoFolderPath: string;
    handleChooseFolder: () => void;
}

export const SettingsModal = ({
    onClose,
    photoFolderPath,
    handleChooseFolder,
}: SettingsModalProps) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content settings-panel" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>
                <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="modal-info">
                        <div className="info-header"><h2>設定</h2></div>
                        <div className="memo-section">
                            <label>VRChat写真フォルダ</label>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <input
                                    type="text"
                                    value={photoFolderPath}
                                    readOnly
                                    style={{ flex: 1, padding: "0.8rem", borderRadius: "12px", border: "1px solid var(--a-border)", background: "rgba(0,0,0,0.03)", fontFamily: "var(--a-font-mono)", fontSize: "0.82rem" }}
                                />
                                <button className="save-button" onClick={handleChooseFolder} style={{ width: "100px" }}>変更</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
```

---

## FILE: hooks\useGridDimensions.ts

`$ext
import { useState, useRef, useEffect } from "react";

export const useGridDimensions = (CARD_WIDTH: number) => {
    const rightPanelRef = useRef<HTMLDivElement>(null);
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [panelWidth, setPanelWidth] = useState(800);
    const [gridWrapperHeight, setGridWrapperHeight] = useState(600);

    useEffect(() => {
        const rpObs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setPanelWidth(entry.contentRect.width);
            }
        });
        const gwObs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setGridWrapperHeight(entry.contentRect.height);
            }
        });
        if (rightPanelRef.current) rpObs.observe(rightPanelRef.current);
        if (gridWrapperRef.current) gwObs.observe(gridWrapperRef.current);
        return () => { rpObs.disconnect(); gwObs.disconnect(); };
    }, []);

    const columnCount = Math.max(1, Math.floor(panelWidth / CARD_WIDTH));
    const gridHeight = Math.max(200, gridWrapperHeight);

    return { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount };
};
```

---

## FILE: hooks\useMonthGroups.ts

`$ext
import { useMemo } from "react";
import { Photo, MonthGroup } from "../types";

export const useMonthGroups = (photos: Photo[], columnCount: number, scrollTop: number, ROW_HEIGHT: number) => {
    const monthGroups = useMemo((): MonthGroup[] => {
        if (!photos.length) return [];
        const groups: MonthGroup[] = [];
        let currentKey = "";

        photos.forEach((photo, i) => {
            const date = new Date(photo.timestamp.replace(" ", "T"));
            const year = isNaN(date.getFullYear()) ? 0 : date.getFullYear();
            const month = isNaN(date.getMonth()) ? 1 : date.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, "0")}`;

            if (key !== currentKey) {
                currentKey = key;
                groups.push({
                    key,
                    year,
                    month,
                    label: `${month}月`,
                    rowIndex: Math.floor(i / columnCount),
                    count: 1
                });
            } else {
                groups[groups.length - 1].count++;
            }
        });
        return groups;
    }, [photos, columnCount]);

    const monthsByYear = useMemo(() => {
        const map = new Map<number, MonthGroup[]>();
        for (const g of monthGroups) {
            if (!map.has(g.year)) map.set(g.year, []);
            map.get(g.year)!.push(g);
        }
        return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
    }, [monthGroups]);

    const activeMonthIndex = useMemo(() => {
        if (!monthGroups.length) return 0;
        const currentRow = Math.floor(scrollTop / ROW_HEIGHT);
        let active = 0;
        for (let i = 0; i < monthGroups.length; i++) {
            if (monthGroups[i].rowIndex <= currentRow) active = i;
            else break;
        }
        return active;
    }, [monthGroups, scrollTop, ROW_HEIGHT]);

    return { monthGroups, monthsByYear, activeMonthIndex };
};
```

---

## FILE: hooks\usePhotoActions.ts

`$ext
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";

export const usePhotoActions = (setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>, addToast: (msg: string) => void) => {
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [photoHistory, setPhotoHistory] = useState<Photo[]>([]);
    const [localMemo, setLocalMemo] = useState("");
    const [isSavingMemo, setIsSavingMemo] = useState(false);

    const handleSaveMemo = async () => {
        if (!selectedPhoto) return;
        setIsSavingMemo(true);
        try {
            await invoke("save_photo_memo_cmd", {
                filename: selectedPhoto.photo_filename,
                memo: localMemo
            });
            setPhotos((prev) => prev.map((p) =>
                p.photo_filename === selectedPhoto.photo_filename ? { ...p, memo: localMemo } : p
            ));
            setSelectedPhoto((prev) => (prev ? { ...prev, memo: localMemo } : null));
            addToast("メモを保存しました。");
        } catch {
            addToast("保存に失敗しました。");
        } finally {
            setIsSavingMemo(false);
        }
    };

    const onSelectPhoto = useCallback((photo: Photo, isSimilarSearch = false) => {
        setSelectedPhoto(prev => {
            if (prev && isSimilarSearch) {
                setPhotoHistory(h => [...h, prev]);
            } else if (!isSimilarSearch) {
                setPhotoHistory([]);
            }
            return photo;
        });
        setLocalMemo(photo.memo);
    }, []);

    const goBackPhoto = useCallback(() => {
        setPhotoHistory(prev => {
            if (prev.length > 0) {
                const newHistory = [...prev];
                const lastPhoto = newHistory.pop()!;
                setSelectedPhoto(lastPhoto);
                setLocalMemo(lastPhoto.memo);
                return newHistory;
            }
            return prev;
        });
    }, []);

    const closePhotoModal = useCallback(() => {
        setSelectedPhoto(null);
        setPhotoHistory([]);
    }, []);

    return {
        selectedPhoto,
        closePhotoModal,
        photoHistory,
        goBackPhoto,
        localMemo,
        setLocalMemo,
        isSavingMemo,
        handleSaveMemo,
        onSelectPhoto,
    };
};
```

---

## FILE: hooks\usePhotos.ts

`$ext
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Photo } from "../types";

export const usePhotos = (searchQuery: string, worldFilter: string) => {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadPhotos = useCallback(async () => {
        setIsLoading(true);
        try {
            const results = await invoke<Photo[]>("get_photos", {
                worldQuery: searchQuery || null,
                worldExact: worldFilter === "all" ? null : worldFilter,
            });
            setPhotos(results);
        } catch (err) {
            console.error("Failed to load photos:", err);
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, worldFilter]);

    useEffect(() => {
        setIsLoading(true);
        loadPhotos();

        const unlisten = listen("scan:completed", () => {
            loadPhotos();
        });

        return () => {
            unlisten.then((u: UnlistenFn) => u());
        };
    }, [loadPhotos]);

    return { photos, setPhotos, loadPhotos, isLoading };
};
```

---

## FILE: hooks\useScan.ts

`$ext
import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScanProgress } from "../types";
import { ToastType } from "./useToasts";

export const useScan = (addToast?: (msg: string, type?: ToastType) => void) => {
    const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "completed" | "error">("idle");
    const [scanProgress, setScanProgress] = useState<ScanProgress>({ processed: 0, total: 0, current_world: "" });
    const [photoFolderPath, setPhotoFolderPath] = useState("");
    const isScanningRef = useRef(false);

    const startScan = useCallback(async () => {
        if (isScanningRef.current) return;
        isScanningRef.current = true;
        setScanStatus("scanning");
        setScanProgress({ processed: 0, total: 0, current_world: "" });
        try {
            await invoke("initialize_scan");
        } catch (err) {
            isScanningRef.current = false;
            setScanStatus("error");
            console.error("Scan error:", err);
            addToast?.("スキャンの開始に失敗しました", "error");
        }
    }, [addToast]);

    const refreshSettings = useCallback(async () => {
        const setting = await invoke<any>("get_setting_cmd");
        setPhotoFolderPath(setting.photoFolderPath || "");
    }, []);

    useEffect(() => {
        const unlistens: Promise<() => void>[] = [];

        // 1. レースコンディションを避けるため、リスナーを先に登録
        unlistens.push(listen<ScanProgress>("scan:progress", (e) => setScanProgress(e.payload)));
        unlistens.push(listen("scan:completed", () => {
            isScanningRef.current = false;
            console.log("Scan completed received");
            setScanStatus("completed");
        }));
        unlistens.push(listen("scan:error", () => {
            isScanningRef.current = false;
            setScanStatus("error");
            addToast?.("スキャンに失敗しました", "error");
        }));

        const init = async () => {
            await refreshSettings();
            await startScan();
        };
        init();

        return () => {
            console.log("Cleanup unlistening");
            unlistens.forEach(p => p.then(u => u()));
        };
    }, []);

    const cancelScan = useCallback(async () => {
        try {
            await invoke("cancel_scan");
        } catch (err) {
            console.error("Cancel failed:", err);
        }
    }, []);

    return { scanStatus, scanProgress, photoFolderPath, startScan, refreshSettings, cancelScan };
};
```

---

## FILE: hooks\useScroll.ts

`$ext
import { useState, useCallback, useRef, useEffect } from "react";

interface UseScrollArgs {
    photosLength: number;
    columnCount: number;
    gridHeight: number;
    ROW_HEIGHT: number;
}

const SCROLLBAR_PADDING = 8;

export const useScroll = ({ photosLength, columnCount, gridHeight, ROW_HEIGHT }: UseScrollArgs) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
    const mouseMoveHandlerRef = useRef<((ev: MouseEvent) => void) | null>(null);
    const mouseUpHandlerRef = useRef<(() => void) | null>(null);

    const totalRows = Math.ceil(photosLength / columnCount);
    const totalHeight = totalRows * ROW_HEIGHT;
    const maxScrollTop = Math.max(0, totalHeight - gridHeight);

    const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollContainerRef.current = e.currentTarget;
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const trackHeight = gridHeight - SCROLLBAR_PADDING;
    const thumbHeight = totalHeight > 0 ? Math.max(32, trackHeight * (gridHeight / totalHeight)) : trackHeight;
    const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * (trackHeight - thumbHeight) : 0;

    const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragStartRef.current = { y: e.clientY, scrollTop };
        setIsDragging(true);

        const onMouseMove = (ev: MouseEvent) => {
            if (!dragStartRef.current || !scrollContainerRef.current) return;
            const delta = ev.clientY - dragStartRef.current.y;
            const ratio = delta / Math.max(1, trackHeight - thumbHeight);
            const newScrollTop = Math.max(0, Math.min(maxScrollTop, dragStartRef.current.scrollTop + ratio * maxScrollTop));
            scrollContainerRef.current.scrollTop = newScrollTop;
        };

        const onMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            mouseMoveHandlerRef.current = null;
            mouseUpHandlerRef.current = null;
        };

        mouseMoveHandlerRef.current = onMouseMove;
        mouseUpHandlerRef.current = onMouseUp;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [scrollTop, trackHeight, maxScrollTop, thumbHeight]);

    useEffect(() => {
        return () => {
            if (mouseMoveHandlerRef.current) {
                document.removeEventListener("mousemove", mouseMoveHandlerRef.current);
            }
            if (mouseUpHandlerRef.current) {
                document.removeEventListener("mouseup", mouseUpHandlerRef.current);
            }
        };
    }, []);

    const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const ratio = (clickY - thumbHeight / 2) / Math.max(1, trackHeight - thumbHeight);
        scrollContainerRef.current.scrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
    }, [thumbHeight, trackHeight, maxScrollTop]);

    const handleJumpToRow = useCallback((rowIndex: number) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = rowIndex * ROW_HEIGHT;
        }
    }, [ROW_HEIGHT]);

    const onGridRef = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            scrollContainerRef.current = node;
        }
    }, []);

    return {
        scrollTop,
        thumbTop,
        thumbHeight,
        isDragging,
        totalHeight,
        onGridRef,
        handleGridScroll,
        handleScrollbarMouseDown,
        handleTrackClick,
        handleJumpToRow,
    };
};
```

---

## FILE: hooks\useToasts.ts

`$ext
import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
    id: number;
    msg: string;
    type: ToastType;
}

export const useToasts = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((msg: string, type: ToastType = "info", duration = 3000) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, msg, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    return { toasts, addToast };
};
```

---

## FILE: index.css

`$ext
/* 空でOK、またはフォントだけ残す */
```

---

## FILE: main.tsx

`$ext
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

## FILE: types\index.ts

`$ext
export interface Photo {
    photo_filename: string;
    photo_path: string;
    world_id: string | null;
    world_name: string | null;
    timestamp: string;
    memo: string;
    phash: string | null;
    isFavorite?: boolean;
    tags?: string[];
    orientation?: "portrait" | "landscape" | "square" | "unknown";
}

export interface ScanProgress {
    processed: number;
    total: number;
    current_world: string;
}

export interface MonthGroup {
    key: string;
    year: number;
    month: number;
    label: string;
    rowIndex: number;
    count: number;
}
```

---

## FILE: vite-env.d.ts

`$ext
/// <reference types="vite/client" />
```

