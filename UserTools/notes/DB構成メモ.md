# Alpheratz データベース構成メモ

現在のデータベーススキーマ（`Alpheratz/src-tauri/src/db.rs` より抽出）を以下にまとめます。
今後の構成検討の資料として活用してください。

## 1. テーブル構成

### photos テーブル
写真の基本情報を管理するメインテーブルです。

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| **photo_filename** | TEXT | PRIMARY KEY | ファイル名（一意） |
| **photo_path** | TEXT | NOT NULL | ファイルの絶対パス |
| **world_id** | TEXT | | VRChat ワールドID |
| **world_name** | TEXT | | VRChat ワールド名 |
| **timestamp** | TEXT | NOT NULL | 撮影日時 |
| **memo** | TEXT | DEFAULT '' | ユーザーメモ |
| **phash** | TEXT | | 画像の類似度計算用ハッシュ |

### photo_embeddings テーブル
（※現在コード上で使用されていない拡張用テーブル）

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| **photo_id** | TEXT | PRIMARY KEY | 写真ID |
| **world_emb** | BLOB | | ワールドの特徴量ベクトル |
| **avatar_emb** | BLOB | | アバターの特徴量ベクトル |
| **world_cluster** | INTEGER | | ワールドクラスタ分類 |
| **avatar_cluster** | INTEGER | | アバタークラスタ分類 |

## 2. インデックス

*   `idx_photos_timestamp`: `photos(timestamp)`
    *   目的: 日付順の高速なソート・フィルタリング
*   `idx_photos_world_name`: `photos(world_name)`
    *   目的: ワールド名による高速な検索

## 3. 設定 (PRAGMA)

*   `journal_mode = WAL`: 書き込み中の読み取りをブロックしない
*   `synchronous = NORMAL`: パフォーマンスと安全性のバランス
*   `foreign_keys = ON`: 外部キー制約の有効化
