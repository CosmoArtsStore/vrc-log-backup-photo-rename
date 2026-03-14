# Alpheratz 現状操作挙動メモ

このフォルダには、現状の Alpheratz の主要画面を静的 HTML モックでまとめています。  
目的は「いまの UI の見た目、情報配置、操作導線を、実装に近い密度で確認できる状態」を残すことです。

## 画面一覧と HTML の対応

- モック一覧: `index.html`
  各画面モックへの入口です。
- 一覧画面: `main-dashboard.html`
  ヘッダー、月ナビ、条件検索サイドバー、アクションカード、写真グリッドをまとめた基本画面です。
- スキャン中オーバーレイ: `scan-overlay.html`
  スキャン中または補足情報更新中に前面表示される進捗画面です。
- 写真詳細モーダル: `photo-modal.html`
  写真詳細、メモ、タグ、ワールドリンク、類似写真導線を示すモーダルです。
- 設定モーダル: `settings-modal.html`
  写真フォルダ変更とログイン時起動設定を行うモーダルです。
- 初回起動の選択モーダル: `startup-choice.html`
  初回のみ表示される自動起動選択ダイアログです。
- 空状態画面: `empty-state.html`
  写真がない場合、または絞り込み結果が 0 件の場合の状態です。

## 実装との紐づき

### 一覧画面

- 実装の中心: `src/App.tsx`
- 関連コンポーネント:
  `src/components/Header.tsx`
  `src/components/FilterSidebar.tsx`
  `src/components/MonthNav.tsx`
  `src/components/ActionCards.tsx`
  `src/components/PhotoGrid.tsx`
- モックで再現している主な要素:
  ヘッダー検索欄、条件検索領域、月ナビ、action card、複数写真カードの情報密度

### スキャン中オーバーレイ

- 実装の中心: `src/App.tsx`
- 関連コンポーネント:
  `src/components/ScanningOverlay.tsx`
- 発火契機:
  `scanStatus === "scanning"`
  `scanStatus !== "scanning" && isEnriching`

### 写真詳細モーダル

- 実装の中心: `src/App.tsx`
- 関連コンポーネント:
  `src/components/PhotoModal.tsx`
- 発火契機:
  写真カード選択時に `selectedPhotoView` が存在する状態
- モックで再現している主な要素:
  画像表示、ワールド名、時刻、world id、向き、お気に入り、タグ、メモ、候補導線

### 設定モーダル

- 実装の中心: `src/App.tsx`
- 関連コンポーネント:
  `src/components/SettingsModal.tsx`
- 発火契機:
  `showSettings === true`

### 初回起動の選択モーダル

- 実装の中心: `src/App.tsx`
- 発火契機:
  `startupPreferenceSet === false`

### 空状態画面

- 実装の中心: `src/App.tsx`
- 関連コンポーネント:
  `src/components/EmptyState.tsx`
- 発火契機:
  `scanStatus !== "scanning" && !isLoading && filteredPhotos.length === 0`

## 操作フローの要約

1. アプリ起動
2. 初回なら自動起動モーダル表示
3. 写真フォルダ設定があれば自動スキャン開始
4. 一覧画面へ遷移し、月移動・検索・条件絞り込みを利用
5. 写真選択で詳細モーダル表示
6. メモ保存、タグ編集、お気に入り、ワールドリンク、Explorer 表示を行う

## モック利用時の見方

- HTML は「静的な見本」です。実データ連携や状態遷移は持っていません。
- ただし、簡易レイアウトではなく、現行実装のカード構成と情報配置に寄せています。
- まず `index.html` から開き、必要な画面へ移動してください。
- デザイン変更や画面分割を行うときは、この Markdown の対応表も一緒に更新してください。
