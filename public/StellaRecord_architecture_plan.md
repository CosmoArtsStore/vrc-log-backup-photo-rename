# StellaRecord — プロジェクト全体アーキテクチャ設計書

> 作成日: 2026-02-27  
> ステータス: 設計確定 / 実装待ち  
> 実装担当: Gemini 3.1 low  

---

## 1. プロジェクト概要

| 旧名称 | 新名称 | 役割 |
|---|---|---|
| RE NAME SYS (リポジトリ全体) | **StellaRecord** | プロジェクト全体の名称 |
| LogBackupTool | **Polaris** | VRChatログバックアップ常駐アプリ |
| tmp/vrc_log_parser | **PLANETARIUM** | VRChatログ→SQLite DBへのストリーマー |
| PhotoRenameApp | **Atlas** | 写真とワールド名を紐づける参照アプリ |
| (新規) | **PLEIADES** | 全アプリを包括する統合管理ツール |

**哲学:** VRChatのローカルログファイルのみを使った、APIなし・外部通信なしの自己体験記録ツール群。

---

## 2. ディレクトリ構成（移行後）

```
f:\DEVELOPFOLDER\StellaRecord\         ← リポジトリルート（RE-NAME-SYSから移行）
│
├── Cargo.toml                          ← ワークスペースルート（全Rustクレートを束ねる）
├── package.json                        ← npmワークスペースルート（全フロントエンドを束ねる）
│
├── stella_core\                        ← 共有Rustライブラリ（旧lbt_core）
│   └── src\
│       ├── config.rs                   ← 設定の読み書き（Preferences構造体）
│       ├── db_schema.rs                ← SQLiteスキーマ定義（CREATE TABLE文の定数）
│       └── lib.rs
│
├── Polaris\                            ← ログバックアップ常駐アプリ（旧LogBackupTool）
│   ├── polaris_ui\                     ← Tauri + React フロントエンド（旧cas_lbtsetting）
│   │   ├── src\
│   │   │   └── App.tsx
│   │   ├── src-tauri\
│   │   │   └── src\
│   │   │       ├── main.rs
│   │   │       └── db.rs              ← PLANETARIUMのDB同期ロジック（Polarisに内包）
│   │   └── tauri.conf.json
│   ├── polaris_observer\               ← バックグラウンド監視バイナリ（旧lbt_app_observer）
│   │   └── src\main.rs
│   └── polaris_backup\                 ← ログコピーバイナリ（旧onsite_log_backup_tool）
│       └── src\main.rs
│
├── PLANETARIUM\                        ← DBストリーマー（旧tmp/vrc_log_parser、本格化）
│   └── src\
│       └── main.rs                    ← CLIバイナリとしてスタンドアロン動作も可
│
├── Atlas\                              ← 写真×ワールド名紐づけアプリ（旧PhotoRenameApp、機能再定義）
│   ├── src\                            ← React フロントエンド
│   │   ├── App.tsx
│   │   └── components\
│   │       ├── PhotoGrid.tsx           ← 写真一覧グリッド
│   │       ├── WorldFilter.tsx         ← ワールド名でフィルター
│   │       └── PhotoDetail.tsx         ← 写真詳細（紐づいたワールド情報を表示）
│   └── src-tauri\
│       └── src\
│           └── main.rs                ← DB読み取り + 写真ファイルスキャンのTauriコマンド
│
└── PLEIADES\                           ← 統合管理ツール（新規）
    ├── src\                            ← React フロントエンド（各アプリのUIを束ねる）
    │   ├── App.tsx                     ← サイドバーで Polaris / Atlas 等を切り替え
    │   └── apps\
    │       ├── PolarisApp.tsx          ← Polarisの全UIコンポーネントをimport
    │       └── AtlasApp.tsx            ← AtlasのUIコンポーネントをimport
    └── src-tauri\
        └── src\
            └── main.rs                ← 全アプリのTauriコマンドを束ねてregister
```

---

## 3. Rustワークスペース構成（Cargo.toml）

```toml
# StellaRecord/Cargo.toml
[workspace]
resolver = "2"
members = [
    "stella_core",
    "Polaris/polaris_ui/src-tauri",
    "Polaris/polaris_observer",
    "Polaris/polaris_backup",
    "PLANETARIUM",
    "Atlas/src-tauri",
    "PLEIADES/src-tauri",
]

[workspace.dependencies]
serde         = { version = "1.0", features = ["derive"] }
serde_json    = "1.0"
chrono        = "0.4"
rusqlite      = { version = "0.31", features = ["bundled"] }
regex         = "1"
tauri         = { version = "2.2.4", features = [] }
tauri-build   = { version = "2.0.5", features = [] }
tauri-plugin-fs     = "2.2.0"
tauri-plugin-dialog = "2.2.0"
tauri-plugin-shell  = "2.2.0"
winapi        = { version = "0.3.9", features = ["winuser", "synchapi", "sysinfoapi", "reason", "handleapi", "winerror"] }
sysinfo       = "0.33.0"
tray-icon     = "0.19.2"
tao           = "0.30"
stella_core   = { path = "stella_core" }
```

---

## 4. ビルドターゲット定義

| ターゲット名 | 内容 | コマンド |
|---|---|---|
| `Polaris + PLANETARIUM` | Polarisの設定UIアプリ単体（DB同期ボタン含む） | `cd Polaris/polaris_ui && npx tauri build` |
| `Atlas` | Atlasアプリ単体 | `cd Atlas && npx tauri build` |
| `PLEIADES-full` | Polaris + PLANETARIUM + Atlas を1つのウィンドウに統合 | `cd PLEIADES && npx tauri build --config tauri.full.conf.json` |
| `PLEIADES-Tool` | Atlas以降のアナリティクス系のみ（Polarisなし） | `cd PLEIADES && npx tauri build --config tauri.tool.conf.json` |

**npmルートのscripts（package.json）:**
```json
{
  "scripts": {
    "build:polaris":      "cd Polaris/polaris_ui && npx tauri build",
    "build:atlas":        "cd Atlas && npx tauri build",
    "build:pleiades-full":"cd PLEIADES && npx tauri build",
    "build:pleiades-tool":"cd PLEIADES && npx tauri build --config tauri.tool.conf.json",
    "dev:polaris":        "cd Polaris/polaris_ui && npx tauri dev",
    "dev:atlas":          "cd Atlas && npx tauri dev",
    "dev:pleiades":       "cd PLEIADES && npx tauri dev"
  }
}
```

---

## 5. 各アプリの機能定義

### 5.1 Polaris（旧LogBackupTool）

**役割:** VRChatログを監視・バックアップする常駐ツール

**構成要素:**
- `polaris_ui` (Tauri GUI): 設定アプリ。バックアップ先設定, DBSync ボタン, スタートアップ設定, etc.
- `polaris_observer` (バイナリ): バックグラウンドでVRChatのプロセスを監視するデーモン
- `polaris_backup` (バイナリ): VRChatログをバックアップ先へコピーする実処理バイナリ

**PLANETARIUMとの関係:**
- Polaris UIの「DB同期」ボタンは、PLANETARIUMのパースロジック（`db.rs`）をそのままPolaris内で呼び出す
- PLANETARIUMは独立したCLIバイナリとしても単体で動く

**設定ファイル:** `%APPDATA%\Polaris\settings.json` (旧`lbt_settings.json`から移行)

---

### 5.2 PLANETARIUM（旧tmp/vrc_log_parser）

**役割:** VRChatログファイルをパースして SQLite DB (`vrc_history.sqlite3`) に記録するストリーマー

**動作モード:**
- `Polaris` UIから呼び出される（組み込みモード）
- 単独CLI バイナリとして `planetarium.exe` で実行可能

**DBファイルパス:** バックアップ先ディレクトリ直下に `vrc_history.sqlite3` を生成

**データモード:**
- Privacy Mode（デフォルト）: 他ユーザーのusr_IDを保存しない
- Tracking Mode（要設定有効化）: usr_IDを含む詳細記録

**スキーマ（`stella_core::db_schema` で定義）:**
```
app_sessions    ← VRChatの起動セッション単位
world_visits    ← ワールド訪問記録（session単位）
players         ← 同席したプレイヤー（display_name, オプションでuser_id）
player_visits   ← どのvisitにどのplayerが居たか
avatar_changes  ← 誰がどのアバターに変えたか
video_playbacks ← どのURLが再生されたか
```

---

### 5.3 Atlas（旧PhotoRenameApp → 機能再定義）

**役割:** VRChatで撮影した写真と、撮影時のワールド情報を紐づけて参照できるビューワー

**⚠️ 重要: リネーム機能は廃止**
- 旧PhotoRenameApp の「ファイル名を変更する」機能は含めない
- 写真フォルダをスキャンし、写真のタイムスタンプと `vrc_history.sqlite3` のworld_visits.join_timeを照合して「どのワールドで撮ったか」を表示するのみ

**UIの主要機能:**
1. 写真グリッド表示（サムネイル一覧）
2. ワールド名でフィルタリング
3. 写真をクリックすると「いつ/どのワールドで撮影したか」の詳細表示
4. DBを参照するだけでファイルの書き換えは一切行わない（Read Only）

**Tauri コマンド:**
```rust
// Atlas に必要なTauriコマンド一覧
scan_photos(photos_dir: String) -> Vec<PhotoMeta>
// 写真ファイルをスキャンしてタイムスタンプ一覧を返す

query_world_for_photo(taken_at: String) -> Option<WorldInfo>
// タイムスタンプを渡すとDBから対応するワールド情報を返す

get_all_worlds_visited() -> Vec<WorldSummary>
// ワールド一覧（フィルター用）を返す
```

---

### 5.4 PLEIADES（新規・統合管理ツール）

**役割:** Polaris, Atlas, 将来追加されるアプリを1つのウィンドウで使える統合シェル

**UIデザイン:** 左サイドバーに各アプリのアイコン。クリックで右ペインに各アプリのUIをレンダリング。

**バックエンド:** 各サブアプリのTauriコマンドをすべて `register` して束ねる。

**ビルド設定の分岐:**
- `tauri.full.conf.json` → 全機能（Polaris + PLANETARIUM + Atlas + ...）を含む
- `tauri.tool.conf.json` → Polaris/PLANETARIUMを除外（設定UIとバックアップ機能なし）、Atlas以降のみ

**フロントエンドのモジュール戦略:**
- AtlasのReactコンポーネントはライブラリとして書き、AtlasスタンドアロンとPLEIADESの両方からimportできる形にする
- PolarisのReactコンポーネントも同様

---

## 6. 共有ライブラリ stella_core（旧lbt_core）

```
stella_core/src/
├── lib.rs
├── config.rs         ← Preferencesの読み書き（アプリ名を"Polaris"に変更）
└── db_schema.rs      ← SQLiteのCREATE TABLE文をstatic constで定義（PLANETARIUMとAtlas両方が使う）
```

**設定ファイルの新パス:**
```
%APPDATA%\Polaris\settings.json    ← Polarisの設定（旧: lbt_settings.json）
```

---

## 7. 移行手順（実装順序）

### Phase 1: ディレクトリ構成移行（ファイル移動・リネーム）

1. `RE-NAME-SYS` → `StellaRecord` にリポジトリフォルダをリネーム（手動 or 実装者が確認して実施）
2. `LogBackupTool\lbt_core` → `StellaRecord\stella_core` にコピー
3. `LogBackupTool\cas_lbtsetting` → `StellaRecord\Polaris\polaris_ui` にコピー
4. `LogBackupTool\lbt_app_observer` → `StellaRecord\Polaris\polaris_observer` にコピー
5. `LogBackupTool\onsite_log_backup_tool` → `StellaRecord\Polaris\polaris_backup` にコピー
6. `tmp\vrc_log_parser` → `StellaRecord\PLANETARIUM` にコピー
7. `PhotoRenameApp` → `StellaRecord\Atlas` にコピー（機能は後で再実装）

### Phase 2: ルートCargo.toml / package.json 作成

1. `StellaRecord\Cargo.toml` を上記仕様で新規作成
2. `StellaRecord\package.json` を上記scriptsで新規作成

### Phase 3: stella_coreのリネーム・更新

1. `lbt_core` → `stella_core` にクレート名変更（Cargo.tomlのname変更）
2. `config.rs` のアプリ名を `Polaris` に変更（設定ファイルパス等）
3. `db_schema.rs` を新規作成してCREATE TABLE文を移管（`db.rs` から抽出）

### Phase 4: Polaris（旧LogBackupTool）更新

1. 各Cargo.toml / tauri.conf.json の `lbt_core` → `stella_core` 参照切り替え
2. アプリ名を `Polaris` に変更（tauri.conf.json の `productName`）
3. db.rsのCompileを確認

### Phase 5: Atlas再実装

1. 旧PhotoRenameAppのリネーム機能を全削除
2. 新UI（PhotoGrid, WorldFilter, PhotoDetail）を実装
3. DBから写真タイムスタンプとworldVisitを照合するコマンドを実装

### Phase 6: PLEIADESシェル作成

1. Tauriプロジェクトを新規作成
2. Polaris/AtlasのUIコンポーネントをimportする統合フロントエンドを実装
3. tauri.full.conf.json / tauri.tool.conf.json を分岐作成

---

## 8. 設計上の制約・ルール

1. **外部API呼び出し禁止**: VRChat API, Discord API 等一切なし
2. **ログファイルの改変禁止**: 読み取り専用（コピーのみ）
3. **写真ファイルの改変禁止（Atlasは特に重要）**: リネーム・移動・削除なし。表示のみ
4. **Privacy Modeのデフォルト化**: `enableUserTracking = false` をデフォルトとする
5. **DBは完全ローカル**: `vrc_history.sqlite3` はユーザーのバックアップ先にのみ保存。クラウド送信なし

---

## 9. 未解決・今後の検討事項

- [ ] PLEIADESのアイコン・ブランドデザイン（星座テーマで統一する）
- [ ] 将来追加アプリの候補（例: ワールド訪問统計ビューワー、フレンド邂逅サマリー等）
- [ ] Atlasの写真タイムスタンプ照合のロジック（写真ファイル名のタイムスタンプ vs EXIF vs ファイル更新日時のどれを使うか）
- [ ] PLEIADESのwindowサイズ設計（サイドバー付きのため最小幅が広くなる）
