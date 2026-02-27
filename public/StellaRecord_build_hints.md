# StellaRecord 移行作業 — ビルドエラー修正ヒント集
> 作成日: 2026-02-27  
> 対象: `f:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\`

---

## 現状サマリー

`cargo check` は **失敗** している。ディレクトリ構造は仕様書通りだが、各設定ファイルの中身がまだ旧名称のまま残っている。

| 確認項目 | 状態 | 詳細 |
|---|---|---|
| ディレクトリ構造 | ✅ OK | 仕様書 §2.3 通り（stella_record_ui, polaris, planetarium, pleiades_alpheratz） |
| ルート `Cargo.toml` のメンバー定義 | ✅ OK | 4クレート正しく列挙済み |
| ルート `workspace.dependencies` | ⚠️ 不足 | `chrono` に `features = ["serde"]` がない |
| `polaris/Cargo.toml` | ✅ OK | |
| `planetarium/Cargo.toml` | ✅ OK | |
| `pleiades_alpheratz/src-tauri/Cargo.toml` | ✅ OK（クレート名は `alpheratz`） | |
| `stella_record_ui/src-tauri/Cargo.toml` | ❌ 旧名称 | `name = "cas_lbtsetting"` → `"stella_record_ui"` に変更 |
| `stella_record_ui/src-tauri/tauri.conf.json` | ❌ 旧名称・旧パス3箇所 | 下記参照 |
| `pleiades_alpheratz/src-tauri/tauri.conf.json` | ❌ 旧名称・Tauri feature不足 | 下記参照 |
| `cargo check` の最終結果 | ❌ エラー2件 | 下記参照 |

---

## 修正が必要な箇所（全部で5ファイル）

---

### ❌ エラー1: `alpheratz` のビルドスクリプトエラー
**ファイル:** `pleiades_alpheratz/src-tauri/tauri.conf.json`  
**ファイル:** `pleiades_alpheratz/src-tauri/Cargo.toml`

**エラーメッセージ:**
```
The `tauri` dependency features on the `Cargo.toml` file does not match the allowlist defined
under `tauri.conf.json`. Please run `tauri dev` or `tauri build` or add the `protocol-asset` feature.
```

**原因:** `tauri.conf.json` に `"assetProtocol": { "enable": true }` が設定されているのに、
`Cargo.toml` の `tauri` 依存に `features = ["protocol-asset"]` が含まれていない。

**修正方法:**

`pleiades_alpheratz/src-tauri/Cargo.toml` の `tauri` 行を以下に変更：
```toml
tauri = { workspace = true, features = ["protocol-asset"] }
```

または、`tauri.conf.json` の `assetProtocol` ブロックを削除して機能をオフにする（Alpheratz は写真ファイルを直接読む必要があるため `protocol-asset` を入れる方が正しい）。

---

### ❌ エラー2: `stella_record_ui` のビルドスクリプトが途中で止まる
**ファイル:** `stella_record_ui/src-tauri/tauri.conf.json`

**問題箇所1: `productName` と `identifier` が旧名称のまま**
```json
// 現状（間違い）
"productName": "CAS_LBTSetting",
"identifier": "com.cosmoartsstore.lbtsetting",
// ↓ 修正後
"productName": "STELLA_RECORD",
"identifier": "com.cosmoartsstore.stellarecord",
```

**問題箇所2: `resources` のパスとファイル名が旧バイナリ名のまま**
```json
// 現状（間違い）
"Backend/OnsiteLogBackupTool.exe": "../../target/release/onsite_log_backup_tool.exe",
"Backend/LBTAppObserver.exe":      "../../target/release/lbt_app_observer.exe"
// ↓ 修正後  ※ tauri.conf.json は src-tauri/ 基準なので相対パスに注意
"Backend/polaris_backup.exe":   "../../../target/release/polaris_backup.exe",
"Backend/polaris_observer.exe": "../../../target/release/polaris_observer.exe"
```

**問題箇所3: ウィンドウタイトル**
```json
// 現状（間違い）
"title": "LogBackupTool Settings",
// ↓ 修正後
"title": "STELLA_RECORD"
```

---

### ⚠️ 警告: `stella_record_ui/src-tauri/Cargo.toml` のクレート名
**Cargo警告ではなく将来の混乱を防ぐために修正推奨**

```toml
// 現状（旧名称）
name = "cas_lbtsetting"
// ↓ 修正後
name = "stella_record_ui"
```

---

### ⚠️ 警告: `pleiades_alpheratz/src-tauri/tauri.conf.json` の名称群
**エラーではないが仕様書との整合性のために修正必要**

```json
// 現状（間違い）
"productName": "PhotoReNameApp",
"identifier":  "com.cosmoartsstore.photorenameapp",
"title":       "PhotoReNameApp"
// ↓ 修正後
"productName": "Alpheratz",
"identifier":  "com.cosmoartsstore.alpheratz",
"title":       "Alpheratz"
```

---

### ⚠️ 警告: ルート `Cargo.toml` の `chrono` feature 不足

`polaris/src/config.rs` などで `chrono` のシリアライズ機能を使う場合（DBへの日時書き込み等）、`serde` フィーチャが必要。

```toml
// 現状
chrono = "0.4"
// ↓ 修正後
chrono = { version = "0.4", features = ["serde"] }
```

---

## ビルドが通ることを確認するコマンド

```powershell
cd f:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord
cargo check
```

すべての修正を適用後、 `Finished` と表示されれば成功。  
（warningは残るが、error: 0 であれば OK）

---

## 仕様書との整合性チェック（一覧）

| 仕様書セクション | 要求内容 | 現状 |
|---|---|---|
| §2.3 リポジトリ構成 | `stella_record_ui/`, `polaris/`, `planetarium/`, `pleiades_alpheratz/` | ✅ |
| §1.2 モジュール一覧 | `STELLA_RECORD.exe` / `Polaris.exe` / `Planetarium.exe` / `Alpheratz.exe` | ❌ tauri.conf.json の productName が旧名称 |
| §9 セキュリティ制約 | `stella_core` 廃止 / 各モジュール独立 | ✅ |
| §0.7 設計原則 No.1 | 外部API呼び出し禁止 | ✅（コード上に外部呼び出しなし） |
| §0.7 設計原則 No.5 | planetarium.db への書き込みは planetarium のみ | ⚠️ 未実装（今後の課題） |
| §6.4 DB スキーマ | 6テーブル定義 | ⚠️ planetarium/src/main.rs は旧parser（テーブルは存在するが名称がvrc_history.sqlite3で保存） |
