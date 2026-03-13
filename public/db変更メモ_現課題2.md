# DB変更メモ（現課題2）

- 対象: `Alpheratz/src-tauri/src/db.rs`
- 変更日: 2026-03-13
- 変更内容:
  - `init_alpheratz_db()` の `photo_embeddings` テーブル作成SQLを削除。
  - 現時点で `photo_embeddings` は参照・更新処理が実装されておらず、未使用のため。
- 補足:
  - 既存DBに当該テーブルが残っていてもアプリ動作に影響はありません。
  - 将来利用する場合は、利用箇所実装時に migration 方針とあわせて再追加してください。
