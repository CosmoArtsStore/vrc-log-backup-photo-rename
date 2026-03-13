# Alpheratz DB定義一覧

## 対象
- `Alpheratz/src-tauri/migrations/V1__initial_schema.sql`
- `Alpheratz/src-tauri/src/db.rs`（初期化SQL）
- `Alpheratz/src-tauri/src/models.rs`（アプリ側レコード型）

## スキーマ定義（SQLite）

### 1. `photos` テーブル
| カラム名 | 型 | 制約 / 備考 |
|---|---|---|
| `photo_filename` | `TEXT` | `PRIMARY KEY` |
| `photo_path` | `TEXT` | `NOT NULL` |
| `world_id` | `TEXT` | NULL許容 |
| `world_name` | `TEXT` | NULL許容 |
| `timestamp` | `TEXT` | `NOT NULL` |
| `memo` | `TEXT` | `DEFAULT ''` |
| `phash` | `TEXT` | NULL許容 |

### 2. `photo_embeddings` テーブル
| カラム名 | 型 | 制約 / 備考 |
|---|---|---|
| `photo_id` | `TEXT` | `PRIMARY KEY` |
| `world_emb` | `BLOB` | NULL許容 |
| `avatar_emb` | `BLOB` | NULL許容 |
| `world_cluster` | `INTEGER` | NULL許容 |
| `avatar_cluster` | `INTEGER` | NULL許容 |

### 3. インデックス
- `idx_photos_timestamp` on `photos(timestamp)`
- `idx_photos_world_name` on `photos(world_name)`

## 補足（実装上のDB初期化）
`db.rs` の `init_alpheratz_db()` でも、マイグレーションSQLと同一内容の `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` を実行しています。加えて以下のPRAGMAを設定しています。

- `PRAGMA journal_mode = WAL;`
- `PRAGMA synchronous = NORMAL;`
- `PRAGMA foreign_keys = ON;`

## アプリ側の対応レコード型
`models.rs` の `PhotoRecord` は `photos` テーブルに対応した型です。

- `photo_filename: String`
- `photo_path: String`
- `world_id: Option<String>`
- `world_name: Option<String>`
- `timestamp: String`
- `memo: String`
- `phash: Option<String>`
