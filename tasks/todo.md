# Polaris Build Check

- [x] Polaris Rust 再構成 🚀
    - [x] `f:\DEVELOPFOLDER\STELLARECORD\Polaris` プロジェクト作成
    - [x] `Cargo.toml` 設定 (依存関係: windows, tray-icon, image, chrono)
    - [x] `icon.ico` の配置 (F:\DEVELOPFOLDER\Polaris からコピー)
    - [x] `src/main.rs` の配置 (提供されたソース)
    - [x] `cargo check` でビルド確認
- [x] Run `cargo clean; cargo check` to verify Rust build
- [x] Fix any compile errors if present
- [x] Verify if frontend builds via `npm run build` (N/A: Polaris has no frontend)

# Alpheratz: 同一ワールド 同一衣装判定機能

- [x] `db.rs` の `init_alpheratz_db` に `photo_embeddings` テーブル作成処理を追加
- [x] SQLite側にカラム(`world_emb`, `avatar_emb`, `world_cluster`, `avatar_cluster`)を追加
- [x] Python版の基本的なアルゴリズム（DBSCANクラスタリングと類似度検索のモック）の実装スクリプト作成

# アプリケーションビルド

- [x] Polarisのインストーラービルド (完了)
    - `F:\DEVELOPFOLDER\STELLARECORD\Polaris\src-tauri\target\release\bundle\nsis\Polaris_1.0.0_x64-setup.exe`

# プロジェクト全体調査 (2026-03-10)

- [x] 全プロジェクトの調査開始 🔍
- [x] 各アプリ (#Polaris, #StellaRecord, #Alpheratz) の設定・ソースコード点検 🧐
- [x] 問題点・課題の抽出と整理 📋
- [x] `public\開発予定表G\未対応2.md` への集約 ✍️

## 調査のまとめ
- パス名の不整合（大文字・小文字、新旧名称）が最大の懸念点
- 旧名 `Planetarium` の残存が激しい（フォルダ名等）
- `Alpheratz` のコアロジックが未実装
- セキュリティ・ビルド設定の細かな揺れがある
