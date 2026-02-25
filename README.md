# Stargazer

抽選・マッチング管理アプリ（Tauri 2 デスクトップアプリ）

完全ローカル運用。外部API・認証は使用しません。応募データはCSV取り込み、キャスト・NGはPC内のJSONで管理します。

## プロジェクト構成

```
desktop/         # Tauri 2 デスクトップアプリ
  src/           # フロントエンド（Vite + React）
  src-tauri/     # Rust バックエンド
docs/            # 設計書・ドキュメント（仕様書、FUNCTIONAL_SPEC 等）
```

## Getting Started

```bash
npm run dev
# または
npm run tauri:dev
```

ビルド:

```bash
npm run build
# または
npm run tauri:build
```
