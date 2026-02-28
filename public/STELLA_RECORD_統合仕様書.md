# STELLA RECORD 統合環境 基本仕様書

| 項目 | 内容 |
|------|------|
| プロダクト名 | STELLA RECORD |
| サブタイトル | VRChat生ログ保全・データベース化・ツール統合プラットフォーム |
| 対象OS | Windows 10 / 11 (64bit) |
| バージョン | 0.3.0 |
| 技術スタック | Rust / Tauri / React (Vite) / SQLite / zstd |
| ステータス | **確定版（未確定事項1件）** |

---

## 目次

0. [設計思想・プロダクト戦略](#0-設計思想プロダクト戦略)
1. [システム概要](#1-システム概要)
2. [ディレクトリ構造](#2-ディレクトリ構造)
3. [インストーラー仕様（NSIS）](#3-インストーラー仕様nsis)
4. [Polaris.exe 詳細仕様](#4-polarisexe-詳細仕様常駐バックアップデーモン)
5. [STELLA_RECORD.exe 詳細仕様](#5-stella_recordexe-詳細仕様メインui)
6. [Planetarium.exe 詳細仕様](#6-planetariumexe-詳細仕様)
7. [Alpheratz.exe 詳細仕様](#7-alpheratzexe-詳細仕様)
8. [設定ファイル仕様](#8-設定ファイル仕様)
9. [データアクセスとセキュリティ制約](#9-データアクセスとセキュリティ制約)
10. [バックアップ仕様（Polaris）](#10-バックアップ仕様polaris)
11. [レジストリ仕様](#11-レジストリ仕様)
12. [制約・注意事項](#12-制約注意事項)
13. [実装タスク一覧](#13-実装タスク一覧)
14. [旧LogBackupToolからの変更点](#14-旧logbackuptoolからの変更点)
15. [未確定事項](#15-未確定事項)
16. [改訂履歴](#改訂履歴)

---

## 0. 設計思想・プロダクト戦略

本セクションは、STELLA RECORDの全技術仕様を貫く設計判断の根拠と、プロダクトとしての市場ポジショニングを定義する。以降の技術仕様はすべてこの思想に従って設計されている。

### 0.1 解決する課題

既存のVRChatツール群（VRCX等）は多機能化の過程で、以下の3つの「意図しない攻撃面」を生んでいる。

| 課題 | 具体的な症状 |
|---|---|
| **心理的負担（FOMO）** | フレンドのオンライン状態・居場所・フレンド解除がリアルタイムで可視化されることで、本来不要な比較・不安・嫉妬を誘発する |
| **社会的スティグマ** | 高機能ツールを使っているだけで「他人のプライバシーを監視している」と周囲から見なされるリスク。クリエイターや集会主催者にとっては信用毀損に直結する |
| **アカウントリスク** | VRChat APIへのアクセスには認証トークンの受け渡しが必要。規約変更時のBAN対象となり得るほか、トークン漏洩による乗っ取りリスクが存在する |

STELLA RECORDは、これらの課題を**「機能の引き算」**によって設計段階から排除する。

### 0.2 ターゲットユーザー

| セグメント | ペルソナ | ニーズ |
|---|---|---|
| **ソーシャルデトックス層** | 既存ツールの過剰な他者監視機能に精神的疲弊を感じている層 | 純粋に「自分自身の過去」だけを静かに振り返りたい |
| **ブランド・信用防衛層** | クリエイター・集会主催者 | ログや写真を高度に管理しつつ、倫理的にクリーンなツールを使っていると周囲に証明したい |
| **プライバシー至上主義・資産防衛層** | ヘビーユーザー | OS移行等による思い出の喪失を防ぎたいが、サードパーティへの認証トークン受け渡しは絶対に避けたい |

### 0.3 コアバリュー（価値提案）

**「機能の引き算による『攻撃面・疑念面を持たない構造』と、絶対的な心理的安全性の提供」**

| 価値 | 実現手段 | 該当する技術仕様 |
|---|---|---|
| **構造的クリーンさ（免罪符）** | API通信とログイン認証を完全排除（No API）。他者の現在を監視する能力が物理的に存在しない設計 | §9 データアクセスとセキュリティ制約、§6.6 Privacy/Trackingモード |
| **ローカル物理資産の完全オフライン結合** | クラウドを介さず、PC内のローカル写真ファイルとログDBを直接結びつける | §7 Alpheratz.exe |
| **中央集権にならない拡張性** | Read-Only DB + 外部ツールランチャー（JewelBox）により、有志の野良ツールを安全に繋ぐ「ローカルOS」として機能 | §5.7 JewelBox、§9.2 アクセス制御 |

### 0.4 競合との差別化

| 観点 | VRCX（既存） | STELLA RECORD |
|---|---|---|
| データ取得方式 | VRChat APIポーリング（認証トークン必要） | **ローカルログファイル読み取りのみ（認証不要）** |
| 他者の追跡能力 | フレンドのオンライン状態・現在地・フレンド解除を検知 | **構造上不可能（ログに記録されないため実装できない）** |
| BANリスク | API利用規約への依存あり | **API不使用のため規約変更の影響を受けない** |
| データ保管 | アプリ内DB（ベンダーロックイン） | **標準SQLite + 生ログtar.zst（ポータブル・可搬性最大）** |
| 拡張性 | プラグインなし（モノリス） | **JewelBox経由でサードパーティ接続可能** |

### 0.5 ビジネスモデル

#### 収益設計

| 区分 | 方針 | 理由 |
|---|---|---|
| STELLA RECORD本体（Polaris / Planetarium / STELLA_RECORD.exe） | **完全無料** | 界隈の安全なインフラとしてシェアを制圧する基盤（OS層） |
| 高度な分析アプリ（Alpheratz等） | **買い切り販売** | 無料基盤の上で動くモジュールとして収益化 |
| サブスクリプション | **意図的に不採用** | サブスク型はユーザーとの関係を「監視・依存」に寄せるため、本プロダクトの思想に反する |

#### 流通チャネル

| チャネル | 詳細 |
|---|---|
| X（Twitter） | フォロワー約5,200人 + 毎朝の「おはツイ」による対話経路。インフルエンサー広告ではなく日々の信頼関係ベースの流通 |
| BOOTH | 既存のツール販売実績と顧客基盤の活用 |

#### コスト構造（スケールフリー）

| コスト項目 | 方針 |
|---|---|
| インフラ費用 | **ゼロ**（完全ローカル処理。ユーザー数に比例しない） |
| 人的サポートコスト | **構造的に遮断**（UI内エラー復旧導線の徹底 + Discordコミュニティによるユーザー間互助） |

### 0.6 信頼構築戦略

| 戦略 | 手段 |
|---|---|
| **客観的な潔白の証明** | コアエンジン（バックアップ・DB抽出）のコードをGitHubで公開（OSS化）。エンジニア層による「本当にAPIを叩いていないか」の第三者監査を可能にする |
| **コミュニティの自走化** | Discordを「サポセン」ではなく「研究フォーラム」として構築。課題解決者へのロール付与で承認欲求をドライブし、ユーザー間でサポートを自走させる |
| **サードパーティとの共犯関係** | JewelBoxを通じて外部アプリ開発者をSTELLA RECORDのエヴァンジェリストに変え、エコシステムを共同拡大する |

### 0.7 設計原則（実装者への指針）

以下の原則は、全モジュールの実装判断において最上位の基準となる。

| # | 原則 | 具体的な禁止事項 |
|---|---|---|
| 1 | **No API** | VRChat API、Discord API、その他あらゆる外部API呼び出しの禁止 |
| 2 | **No Auth** | ユーザーのVRChat認証情報（トークン・パスワード）の取得・保持・送信の禁止 |
| 3 | **No Cloud** | ユーザーデータの外部送信禁止。分析・テレメトリを含む一切のネットワーク通信の禁止 |
| 4 | **Read-Only Source** | VRChat生ログの改変・削除の禁止。コピー（バックアップ）のみ許可 |
| 5 | **Write-Once DB** | planetarium.db への書き込みは Planetarium.exe のみ。他モジュールはRead-Only |
| 6 | **No File Mutation** | 写真ファイルのリネーム・移動・削除の禁止（Alpheratzは表示・紐づけのみ） |
| 7 | **Offline First** | 全機能がインターネット接続なしで動作すること |

---

## 1. システム概要

STELLA RECORDは、VRChatが出力する生ログを安全にバックアップ・データベース化し、そのデータを活用するツール群を統合管理するプラットフォームである。

### 1.1 データフロー（一方向性の原則）

全てのデータは以下の一方向フローで生成され、逆流は許可しない。

```
VRChat生ログ
    ↓
Polaris.exe（常駐デーモン）
    ↓ ログファイルを一時保持
STELLA_RECORD.exe 起動
    ↓ 子プロセスとして非同期起動
Planetarium.exe（差分パース→DB登録→tar.zst化→終了）
    ↓
/app/Polaris/archive/zip/  ←  YYYYMMDD_HHMMSS.tar.zst
    ↓
planetarium.db（Read/Write: Planetariumのみ）
    ↓
STELLA_RECORD.exe / Alpheratz.exe（Read-Only参照）
```

### 1.2 モジュール・製品一覧

| 製品（インストーラー） | 実行ファイル (exe) | 概要 | 同梱物 |
|---|---|---|---|
| **Polaris-setup.exe** | `Polaris.exe` | **ログバックアップ常駐アプリ**。VRCログ変更を監視し差分をコピーし続けるバックグラウンドデーモン。 | なし |
| **STELLARECORD-setup.exe** | `STELLA_RECORD.exe` | **メインUI・ランチャー**。ログの確認UIの提供、他アプリ（Alpheratz等）の軌道ハブ。 | `Planetarium.exe` |
| (同梱) | `Planetarium.exe` | **ログデータDB化ツール**。バックアップログをパースしてデータベースに登録する。 | なし |
| **alpheratz-setup.exe** | `alpheratz.exe` | **写真ビューアー・分析アプリ**。写真ファイルとワールド記録を時刻ベースで紐づける。 | なし |

> ※ `stella_core`（旧`lbt_core`）は**廃止**。各モジュールが自前でログ出力・設定読み込みを持つ。

### 1.3 Pleiades と JewelBox の位置づけ

| 区分 | 概要 | カード情報の登録方法 |
|---|---|---|
| **Pleiades** | 自社製アプリのリンク集（カードUI） | アプリのインストーラー/連携ボタンが `PleiadesPath.json` に書き込む |
| **JewelBox** | 有志製アドオンアプリのリンク集（カードUI） | アドオン側の連携ボタンが `JewelBoxPath.json` に書き込む |

両者はカードUI形式で表示される。STELLA_RECORD.exeが起動していなくてもJSONへの書き込みのみで登録完了する。重複アプリ名が存在する場合はSTELLA_RECORD側で一意にしてから表示する。

---

## 2. ディレクトリ構造

### 2.1 インストール先パス

```
%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\
```

### 2.2 ディレクトリ構成（インストール後）

```
STELLARECORD/
├── STELLA_RECORD.exe                  # メインUI（SPA）
├── app/
│   ├── Polaris/
│   │   ├── Polaris.exe                # 常駐バックアップデーモン
│   │   └── backup/                    # 生ログ保全領域
│   │       └── zip/                   # YYYYMMDD_HHMMSS.tar.zst
│   ├── Planetarium/
│   │   ├── Planetarium.exe            # DB構築・管理エンジン
│   │   └── planetarium.db             # 抽出済みデータ（Planetariumのみ書き込み可）
│   └── Alpheratz/
│       ├── Alpheratz.exe              # 写真ビューアー
│       ├── Alpheratz.db               # 写真メタデータ・メモ
│       ├── AlpheratzSetting.json      # Alpheratz専用設定
│       └── thumbnail_cache/           # サムネイルキャッシュ
└── setting/
    ├── PlanetariumSetting.json        # Planetarium設定（兼、全体ディレクトリ設定）
    ├── PleiadesPath.json              # 自社アプリカード情報
    └── JewelBoxPath.json              # 外部アドオンカード情報
```

### 2.3 リポジトリ構成

```
f:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\
├── Cargo.toml                          ← Workspace Root
├── stella_record_ui/                   ← Tauri App（メインUI）
│   ├── src-tauri/src/main.rs           → STELLA_RECORD.exe
│   └── src/                            ← React frontend (Vite / SPA)
├── polaris/                            ← Rust Binary（常駐デーモン）
│   └── src/main.rs                     → Polaris.exe
├── planetarium/                        ← Rust Binary（DB構築）
│   └── src/main.rs                     → Planetarium.exe
└── pleiades_alpheratz/                 ← Tauri App（写真ビューアー）
    ├── src-tauri/src/main.rs           → Alpheratz.exe
    └── src/                            ← React frontend (Vite)
```

---

### 3.1 製品別インストーラー構成

| 設定項目 | Polaris | STELLA RECORD | Alpheratz |
|---|---|---|---|
| インストール path | `$LOCALAPPDATA\CosmoArtsStore\STELLARECORD\app\Polaris` | `$LOCALAPPDATA\CosmoArtsStore\STELLARECORD` | `$LOCALAPPDATA\CosmoArtsStore\STELLARECORD\app\Alpheratz` |
| 主な同梱 exe | `Polaris.exe` | `STELLA_RECORD.exe`, `Planetarium.exe` | `alpheratz.exe` |
| スタートアップ登録 | **あり** (`HKCU\...\Run`) | なし | なし |
| 作成ツール | NSIS (Tauri) | NSIS (Tauri) | NSIS (Tauri) |

### 3.2 共通インストール処理

1. **既存インストールの検出** — 各インストール先フォルダの存在をチェック。
2. **プロセス終了** — インストール先の exe（`Polaris.exe` 等）に対し `WM_CLOSE` 送信 + 待機後 `taskkill` による安全な停止。
3. **データ保全** — `setting/` や各種 DB (`.db`)、`archive/` フォルダは削除しない。exe 等のプログラム本体のみを更新。

---

## 4. Polaris.exe 詳細仕様（常駐バックアップデーモン）

### 4.1 概要・背景
VRChatの生ログファイルを監視し、終了を検知してバックアップ先へ同期する軽量デーモン。**本モジュールは実装完了し、凍結されている。**

| 項目 | 内容 |
|---|---|
| 実装状態 | **凍結（今後一切の変更を禁止）** |
| 実装言語 | Rust |
| サブシステム | `#![windows_subsystem = "windows"]` ＋ `FreeConsole()`（完全非表示） |
| 依存関係 | `sysinfo` (プロセス監視のみ使用) |
| 設定ファイル | **なし（パス等はコード内ハードコードで凍結）** |
| 構造 | `main.rs` 単一ファイル構成 |

### 4.2 動作ロジック（現行実装のすべて）
- **完全ステルス動作**: `FreeConsole()` により、コンソールを開かずバックグラウンドで無限ループする。
- **監視間隔**: 3秒（`thread::sleep(Duration::from_secs(3))`）。
- **プロセス監視**: `sysinfo` の `refresh_processes` を最小負荷モード（`false`）で実行し、`vrchat.exe` の存否のみを確認。
- **バックアップ発火**: VRChat終了検知から3秒後（`thread::sleep(Duration::from_millis(3000))`）。
- **増分判別**: `src.len() > d.len()`（サイズ比較による追記検知）。

### 4.3 同期ロジック (`sync_logs`)
- **ソース**: `%APPDATA%\..\LocalLow\VRChat\VRChat`
- **バックアップ先**: `%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\app\Polaris\backup`
- **対象**: `output_log_*.txt` に限定。
- **注意**: 設定ファイルを参照せず、完全にスタンドアロンで動作する。

---

## 5. STELLA_RECORD.exe 詳細仕様（メインUI）

### 5.1 概要

STELLA RECORDの全機能へのアクセスを提供するメインアプリケーション。SPAとして実装し、同一ウィンドウ内でセクションを切り替える。

| 項目 | 内容 |
|---|---|
| 旧名称 | CAS_LBTSetting.exe + LBTAppObserver.exe（統合・廃止） |
| 実装 | Tauri（Rust バックエンド + React/Vite フロントエンド） |
| UIアーキテクチャ | SPA（シングルページアプリケーション） |

### 5.2 起動シーケンス

1. STELLA_RECORD.exe が起動する
2. `Planetarium.exe` を子プロセスとして**非同期**で起動する
3. UIはすぐに表示する（Planetariumの処理完了を待たない）
4. Planetarium.exe の処理が完了したら、UI右下にトースト通知を表示する

### 5.3 メインナビゲーション

各セクションはカードUI形式で表示・選択する。同一ウィンドウ内で切り替わる（SPA）。

| セクション | 内容 |
|---|---|
| **Polaris** | Polaris.exeの設定・ログ監視・手動バックアップ |
| **Planetarium** | DB管理・手動最新化・WARNING操作 |
| **Pleiades** | 自社製アプリのカードUI一覧（ランチャー） |
| **JewelBox** | 外部アドオンのカードUI一覧（ランチャー） |

### 5.4 Polaris セクション

**設定UI要素:**

| UI要素 | 対応設定 | 備考 |
|---|---|---|
| ログ保存パス設定 | `PlanetariumSetting.archivePath` | Polarisの出力先 (`app/Polaris/backup`) と合わせる |
| スタートアップ設定 | レジストリ制御 | HKCU Run への登録・削除 |
| 手動バックアップ | 独自ロジック | `stella_record_ui` 内の `execute_manual_backup` コマンド |

**ログ監視エリア:**
- `polaris_appinfo.log` は凍結版Polarisでは出力されないため、現在は非推奨機能となっている。

> **⚠️ パスの不整合に関する注意:** 現在、凍結された Polaris は `backup` フォルダを使用しているが、Planetarium および Launcher の一部コードでは `archive` を参照している。これらは今後、Polaris の実態に合わせて `backup` に統一されるべきである。

### 5.5 Planetarium セクション

**通常操作:**

| UI要素 | 動作 |
|---|---|
| 手動最新化ボタン | Planetarium.exeを子プロセスとして起動（差分のみ取り込み・通常更新） |

**WARNING エリア（復旧用操作）:**

| UI要素 | 動作 |
|---|---|
| DB初期化ボタン | 警告ポップアップ → OK押下で `planetarium.db` のデータを全消去・空DBとして再作成。自動再取り込みは行わない。復旧は強制Syncで実施する |
| 強制Syncボタン | 警告ポップアップ → OK押下でPlanetarium.exeを強制Syncモードで起動。`archive/zip/` 配下のtar.zstを1本ずつ解凍・読み込みして全データを復元する。進捗表示（例: 「15 / 230件処理中」）とキャンセルボタンを表示する |

> **DB初期化 → 強制Sync の順番が、DBが破損した際の標準復旧手順となる。**

### 5.6 Pleiades セクション

- `PleiadesPath.json` を読み込み、登録されているアプリをカードUI形式で表示する
- カードをクリックすると対象の `.exe` を別プロセスとして起動する
- 重複アプリ名は一意にしてから表示する

### 5.7 JewelBox セクション

- `JewelBoxPath.json` を読み込み、登録されているアドオンをカードUI形式で表示する
- カードをクリックすると対象の `.exe` を別プロセスとして起動する
- 重複アプリ名は一意にしてから表示する

### 5.8 Pleiades / JewelBox カード情報の登録仕様

外部アプリ・アドオンのインストーラーまたは連携ボタンが、対応するJSONに以下の形式で自身の情報を書き込む。

```json
[
  {
    "name": "アプリ名",
    "description": "アプリの説明",
    "path": "C:\\path\\to\\app.exe",
    "icon_path": "C:\\path\\to\\icon.png"
  }
]
```

- 追記形式（既存エントリを保持）
- STELLA_RECORD.exeが起動していない場合もJSONへの書き込みのみで登録完了
- 同一アプリ名が存在する場合は上書き（重複防止）

---

## 6. Planetarium.exe 詳細仕様

### 6.1 概要・目的
rawログからメタデータを抽出し、`planetarium.db` を生成・更新する「DB構築エンジン」。常駐はせず、タスク完了後に自動終了する。

| 項目 | 内容 |
|---|---|
| バージョン | 0.1.0 |
| 実装言語 | Rust (edition 2024) |
| 動作モード | 通常モード（差分取得） / 強制Syncモード（全アーカイブ再構築） |
| 主要機能 | ログパース、SQLite登録、処理済みログの `tar.zst` アーカイブ化 |

### 6.2 データベーススキーマ（planetarium.db）
本セクションは Planetarium が生成・維持する DB の決定版仕様である。

#### 6.2.1 セッション管理 (`app_sessions`)
VRChatの起動〜終了（1つのログファイル）を1単位とする。
- `log_filename`: ユニークキー。重複インポートを防止。
- `start_time` / `end_time`: ログ内の最初と最後のタイムスタンプ。

#### 6.2.2 ワールド訪問 (`world_visits`)
- `world_id`: `wrld_...` 形式の ID。
- `instance_id`: インスタンス識別子。
- `access_type`: `public`, `friends`, `hidden` 等。

#### 6.2.3 プレイヤー・滞在記録 (`players`, `player_visits`)
- `players`: 表示名および `usr_ID`（Trackingモード時のみ）を管理。
- `player_visits`: ワールド内での滞在期間を記録。

#### 6.2.4 各種イベント (`avatar_changes`, `video_playbacks`)
- `avatar_changes`: アバター名の変更を捕捉（avtr_IDは取得不可）。
- `video_playbacks`: USharpVideo等の動画再生URLを記録。

### 6.3 プライバシー制御（Privacy / Tracking モード）
設定 `enableUserTracking` により、機微情報の保存レベルを変更する。

| モード | `usr_ID` (自分/他者) | 表示名 |
|---|---|---|
| **Privacy (Default)** | 保存しない (NULL) | 保存する（他者は `[User_Masked]`, 自分は `[LocalPlayer]`） |
| **Tracking** | すべて保存 | 実名を保存 |

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `url` | `[USharpVideo] Started video load for URL: (URL), requested by (表示名)` | — |
| `display_name_raw` | 同上の `requested by` 部分 | alt形式（下記）ではリクエスト者不明 |
| — | `[USharpVideo] Started video: (URL)` | alt形式。リクエスト者情報なし |

> **⚠️ 実装上の注意:** 実際のログでは `[USharpVideo]` ではなく `[<color=#9C6994>USharpVideo</color>]` と Unity Rich Text タグ付きで出力される。正規表現はタグを考慮する必要がある。

### 6.5 パース対象ログ行パターン一覧
以下は実際の実装（`planetarium/src/main.rs`）で使用されている正規表現パターン。

| # | パターン | 正規表現 | 抽出先テーブル |
|---|---|---|---|
| 1 | タイムスタンプ | `^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})` | 全行の基準 |
| 2 | ユーザー認証 | `User Authenticated: (.*?) \((usr_.*?)\)` | `app_sessions` |
| 3 | ビルド情報 | `VRChat Build: (.*)` | `app_sessions` |
| 4 | ワールド入室（名） | `\[Behaviour\] Entering Room: (.*)` | `world_visits` |
| 5 | ワールド入室（ID） | `\[Behaviour\] Joining (wrld_[^:]+)(?::(\d+))?~?((?:private\|friends\|hidden\|public\|group)[^~]*)(?:~region\(([^)]+)\))?` | `world_visits` |
| 6 | ワールド退室 | `\[Behaviour\] OnLeftRoom` | `world_visits` |
| 7 | プレイヤー参加 | `\[Behaviour\] OnPlayerJoined (.*?) \((usr_.*?)\)` | `player_visits` |
| 8 | プレイヤー退出 | `\[Behaviour\] OnPlayerLeft (.*?) \((usr_.*?)\)` | `player_visits` |
| 9 | プレイヤー初期化 | `\[Behaviour\] Initialized PlayerAPI "(.*?)" is (local\|remote)` | `player_visits` |
| 10 | アバター変更 | `\[Behaviour\] Switching (.*?) to avatar (.*)` | `avatar_changes` |
| 11 | 動画再生（詳細） | `\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video load for URL: (.*?), requested by (.*)` | `video_playbacks` |
| 12 | 動画再生（簡易） | `\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video: (.*)` | `video_playbacks` |

### 6.6 Privacy / Tracking モードの差分

`PlanetariumSetting.json` に `enableUserTracking` を設けてモードを切り替える。

| データ項目 | Privacy（デフォルト） | Tracking |
|---|---|---|
| `app_sessions.my_user_id` | **NULL** | `usr_xxx` を保存 |
| `world_visits.instance_owner` | **NULL** | `usr_xxx` を保存 |
| `players.user_id` | **NULL** | `usr_xxx` を保存（UNIQUE制約で名前変更を追跡可能） |
| `world_visits.instance_id` | フル文字列（※usr_IDを含む） | フル文字列 |
| その他全項目 | 両モード共通 | 両モード共通 |

> **Privacyモードの設計意図:** 他プレイヤーの `usr_ID` をDBに蓄積しないことで、DBファイルが流出した場合の個人特定リスクを低減する。ただし `instance_id` のフル文字列にはインスタンスオーナーの `usr_ID` が含まれる場合がある。この点は利用規約・注意事項で周知する。

> **両モード共通の原則:** VRChat APIは一切使用しない。ローカルログファイルの読み取りのみ。フレンドのオンライン状態・現在地の監視機能は構造上存在しない。

### 6.7 ログに出力されないためDBに記録できない情報

| 情報 | 理由 |
|---|---|
| スクリーンショット撮影イベント | VRChatログに出力されない（写真ファイル名のタイムスタンプから推定する：Alpheratz側の機能） |
| テキストチャット内容 | VRChatログに出力されない |
| フレンド申請・承認 | VRChatログに出力されない |
| フレンドのオンライン状態 | VRChatログに出力されない（APIでのみ取得可・本ツールはAPI不使用） |
| ワールドのサムネイル・説明文 | APIでのみ取得可 |
| アバターのavtr_ID | ログにはアバター名のみ出力されIDは含まれない |
| グループ名 | `group(grp_xxx)` のアクセスタイプは確認可能だが、グループの表示名はログに出力されない |

---

## 7. Alpheratz.exe 詳細仕様

### 7.1 概要

VRChat写真とワールド情報を照合・表示・メモ管理する独立アプリケーション。**ファイルリネーム機能は持たない。**

| 項目 | 内容 |
|---|---|
| 旧名称 | 新規 |
| 実装 | Tauri（Rust バックエンド + React/Vite フロントエンド） |
| planetarium.db アクセス | **Read-Only のみ** |

### 7.2 起動シーケンス

1. `AlpheratzSetting.json` から写真フォルダパスを読み込む
2. UIを先に表示する
3. バックグラウンドで写真スキャン処理を実行する（ローディング表示）
4. スキャン完了後、カードUIを順次表示する

### 7.3 写真スキャン処理（差分スキャン）

起動時に以下の処理をバックグラウンドスレッドで実行する。

1. 指定フォルダ内のVRC写真フォーマットに合致するファイルを全件取得する
   - 対象: ファイル名にVRChatのタイムスタンプ形式が含まれるもの
   - 例: `VRChat_2024-01-01_12-00-00.000_1920x1080.png`
2. 取得したファイル名リストと `Alpheratz.db` の `photo_filename` を照合する
3. **DBに存在しないファイル名（新規）** のみ以下の処理を行う:
   - ファイル名から `timestamp` をパースして保存する
   - `planetarium.db` の `join_datetime ≦ timestamp ≦ leave_datetime` の範囲でワールドを照合し、`world_id` と `world_name` を取得する
   - 照合できなかった場合は `world_id = NULL`・`world_name = "ワールド不明"` として登録する
   - `Alpheratz.db` に登録する
   - サムネイルを生成して `thumbnail_cache/` に保存する
4. **DBに存在するファイル名（既存）** はスキャンをスキップし、DBから情報を参照する
5. 指定フォルダに存在しないファイルのカードは表示しない（DBのレコードは削除しない）

### 7.4 写真フォルダパス変更時の処理

`AlpheratzSetting.json` の写真フォルダパスが変更された場合、次回起動時に `Alpheratz.db` 内の全 `photo_path` を新パスに一括更新する。

### 7.5 サムネイルキャッシュ

- 初回スキャン時に各写真のサムネイルを生成して `/app/Alpheratz/thumbnail_cache/` に保存する
- カードUIの表示はサムネイルキャッシュから読み込む
- フルサイズ画像は詳細ポップアップ表示時のみフォルダから直接読み込む

### 7.6 カードUI

**Virtual Scroll を採用**し、画面に見えている分だけ描画することで大量の写真でもパフォーマンスを維持する（`react-window` または `react-virtual` を使用）。

**絞り込み・検索:**

| 機能 | 内容 |
|---|---|
| 時期指定 | 撮影日時の範囲指定でフィルタリング |
| ワールド名テキスト検索 | `world_name` を部分一致検索 |
| ワールド名プルダウン | 登録済みのワールド名一覧からプルダウン選択 |

**カード表示内容:**
- サムネイル画像
- ワールド名（または「ワールド不明」）
- 撮影日時

### 7.7 写真詳細ポップアップ

カードをクリックすると以下の詳細ポップアップを表示する。

| 要素 | 内容 |
|---|---|
| 写真（フルサイズ） | フォルダから直接読み込んで表示 |
| ワールド名 | クリックでVRChatワールドURLを外部ブラウザで開く（`https://vrchat.com/home/world/{world_id}`） |
| 撮影日時 | `timestamp` を表示 |
| メモ | テキストエリアで自由記述。ポップアップ内で編集・保存可能 |

### 7.8 Alpheratz.db スキーマ

```sql
CREATE TABLE photos (
    photo_filename  TEXT PRIMARY KEY,  -- ファイル名（スキップ判定キー）
    photo_path      TEXT NOT NULL,     -- フルパス（表示・読み込みに使用）
    world_id        TEXT,              -- VRCのworld_id（照合失敗時はNULL）
    world_name      TEXT,              -- ワールド名（照合失敗時は "ワールド不明"）
    timestamp       TEXT NOT NULL,     -- 撮影日時（ファイル名からパース済み）
    memo            TEXT DEFAULT ''    -- ユーザーメモ
);
```

---

## 8. 設定ファイル仕様

### 8.1 PolarisSetting.json

**パス:** `%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\setting\PolarisSetting.json`

```json
{
  "archivePath": "",
  "capacityThresholdBytes": 10737418240,
  "enableStartup": true,
  "migrationStatus": "done",
  "migrationSourcePath": ""
}
```

| キー | 型 | 説明 | 初期値 |
|---|---|---|---|
| `archivePath` | string | archiveフォルダのパス（空 = デフォルト） | `""` |
| `capacityThresholdBytes` | number (u64) | 容量警告閾値（バイト単位） | `10737418240`（10GB） |
| `enableStartup` | boolean | Polaris.exe スタートアップ自動起動設定 | `true` |
| `migrationStatus` | string | パス移動状態（`"done"` / `"in_progress"`） | `"done"` |
| `migrationSourcePath` | string | 移動元パス（`in_progress` 時のみ使用） | `""` |

### 8.2 PlanetariumSetting.json

**パス:** `%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\setting\PlanetariumSetting.json`

```json
{
  "archivePath": "",
  "dbPath": ""
}
```

| キー | 型 | 説明 | 初期値 |
|---|---|---|---|
| `archivePath` | string | 参照（収集）するrawログフォルダ。Polarisの出力先と合わせる | `""`（デフォルトは `../Polaris/backup`） |
| `dbPath` | string | planetarium.db の保管パス | `""` |
| `enableUserTracking` | boolean | 個人特定情報の保存許可（プライバシー設定） | `false` |

### 8.3 PleiadesPath.json / JewelBoxPath.json（構造共通）

**パス:** `%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\setting\PleiadesPath.json` 他

```json
[
  {
    "name": "アプリ名",
    "description": "アプリの説明",
    "path": "C:\\path\\to\\app.exe",
    "icon_path": "C:\\path\\to\\icon.png"
  }
]
```

### 8.4 AlpheratzSetting.json

**パス:** `%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\app\Alpheratz\AlpheratzSetting.json`

```json
{
  "photoFolderPath": ""
}
```

---

## 9. データアクセスとセキュリティ制約

### 9.1 一方向性の原則

```
VRChat生ログ → Polaris.exe（バックアップ）→ Planetarium.exe（抽出）→ planetarium.db
```

### 9.2 planetarium.db のアクセス制御

| アクター | DB権限 | 備考 |
|---|---|---|
| Polaris.exe | **—（DB非使用）** | ファイルバックアップのみ |
| STELLA_RECORD.exe | **—（DB非使用）** | 設定JSON・appinfo.logのみ参照 |
| Planetarium.exe | **Read / Write** | 唯一の書き込み権限保有者 |
| Alpheratz.exe | **Read Only** | `world_id`・`world_name`・`join_datetime`・`leave_datetime` を照合用途のみで参照 |
| JewelBox経由外部アプリ | **Read Only** | 書き込み禁止 |

### 9.3 設定と作業領域の分離

各ツールが固有の設定・キャッシュを保存する場合、`planetarium.db` に書き込んではならない。ツールごとに独立した設定ファイルまたは専用DBを使用すること。

---

## 10. バックアップ仕様（Polaris）

### 10.1 バックアップ対象

| 対象 | パス |
|---|---|
| VRChat生ログ | `%APPDATA%\..\LocalLow\VRChat\VRChat\output_log*.txt` |

### 10.2 保存形式

| 項目 | 内容 |
|---|---|
| 形式 | tar.zst（tarアーカイブをzstd圧縮） |
| 粒度 | 1セッション（VRChat起動〜終了）分をまとめて1ファイル |
| 命名規則 | `YYYYMMDD_HHMMSS.tar.zst`（Planetarium.exe起動時刻） |
| 保存先 | `PolarisSetting.json` の `archivePath` |

### 10.3 バックアップ実行タイミング

| タイミング | トリガー | 実行者 |
|---|---|---|
| 起動時バックアップ | Polaris.exe 起動 | Polaris.exe |
| 終了時バックアップ | vrchat.exe プロセスの停止検知 | Polaris.exe |
| 手動バックアップ | STELLA_RECORD.exe のボタン押下 | STELLA_RECORD.exe（Polaris.exe未起動・VRChat未起動が条件） |

---

## 11. レジストリ仕様

| キー | 値名 | 値の内容 | 操作タイミング |
|---|---|---|---|
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` | Polaris | Polaris.exe のフルパス | インストール時・STELLA_RECORD設定変更時 |

> ※ STELLA_RECORD.exe はスタートアップ登録しない。

---

## 12. 制約・注意事項

### 12.1 設定反映タイミング

- STELLA_RECORD.exeで変更した設定は、Polaris.exeには即時反映されない
- 即時反映するには、タスクトレイからPolaris.exeを再起動すること

### 12.2 ユーザーへの周知事項（マニュアル記載必須）

- スタートアップからの無効化手順を必ずマニュアルに記載すること
- スタートアップをOFFにするとバックアップが自動実行されないことを明記すること

### 12.3 確定済み実装ルール

| ルール | 内容 |
|---|---|
| PolarisSetting.json の読み込み | 起動時にtmpコピーしてから読み込む。STELLA_RECORD.exeによる書き込み中との共有違反を防ぐためのガード |
| 容量監視タイミング | 起動時 + 各バックアップ実行直後 |
| クラッシュループ対策 | `RegisterApplicationRestart` は「起動から60秒以上経過後のクラッシュ」に有効となるよう初期化順序を調整する |
| appinfo.log の競合回避 | STELLA_RECORD.exeがログを読み取る際は SharedRead モードで開くことを必須とする |
| インストーラーによるプロセス停止 | `taskkill` による強制終了ではなく `WM_CLOSE` 送信を優先する |
| archiveパス移動 | コピー成功確認後に元フォルダを削除。コピー中クラッシュ時は削除しない。migrationStatusで状態管理 |

---

## 13. 実装タスク一覧

| ID | カテゴリ | タスク | ステータス | 旧ID |
|---|---|---|---|---|
| 301 | 環境 | 新規ワークスペース (StellaRecord) の作成および Cargo/Tauri のセットアップ | [ ] | 201 |
| 302 | Polaris | Polaris.exe: タスクトレイ常駐化・RegisterApplicationRestart登録 | [ ] | 203 |
| 303 | Polaris | Polaris.exe: vrchat.exe 監視ループ（5秒）・終了後バックアップ処理 | [ ] | 204 |
| 304 | Polaris | Polaris.exe: raw log一時保持・Planetarium処理後のtar.zst化 | [ ] | 新規 |
| 305 | Polaris | Polaris.exe: 容量監視・polaris_appinfo.log 出力の実装 | [ ] | 205 |
| 306 | Polaris | Polaris.exe: archiveパス変更時のフォルダ移動処理（コピー→削除・migrationStatus管理・PlanetariumSetting自動同期） | [ ] | 新規 |
| 307 | STELLA_RECORD | STELLA_RECORD.exe (Tauri): Polarisセクション（設定・ログ表示・手動バックアップ） | [ ] | 206〜209 |
| 308 | STELLA_RECORD | STELLA_RECORD.exe (Tauri): Planetariumセクション（手動最新化・DB初期化・強制Sync進捗表示・キャンセル） | [ ] | 新規 |
| 309 | STELLA_RECORD | STELLA_RECORD.exe (Tauri): Pleiadesセクション（PleiadesPath.json読み込み・カードUI・重複排除） | [ ] | 新規 |
| 310 | STELLA_RECORD | STELLA_RECORD.exe (Tauri): JewelBoxセクション（JewelBoxPath.json読み込み・カードUI・重複排除） | [ ] | 新規 |
| 311 | STELLA_RECORD | STELLA_RECORD.exe (Tauri): Planetarium.exe子プロセス起動・完了トースト通知の実装 | [ ] | 新規 |
| 312 | STELLA_RECORD | STELLA_RECORD.exe (React): SPAメインナビ・カードUI・各セクションUI構築 | [ ] | 新規 |
| 313 | Planetarium | Planetarium.exe: SQLiteスキーマ設計・DB初期化処理 | [ ] | 210 |
| 314 | Planetarium | Planetarium.exe: 通常モード（差分取得・DB登録・tar.zst化） | [ ] | 211 |
| 315 | Planetarium | Planetarium.exe: 強制Syncモード（全件解凍・DB復元・進捗通知・キャンセル対応） | [ ] | 212 |
| 316 | Alpheratz | Alpheratz.exe: 起動時バックグラウンドスキャン・差分照合・Alpheratz.db登録 | [ ] | 213 |
| 317 | Alpheratz | Alpheratz.exe: サムネイルキャッシュ生成・管理（thumbnail_cache/） | [ ] | 新規 |
| 318 | Alpheratz | Alpheratz.exe: Virtual Scrollカードを実装・絞り込み・検索 | [ ] | 214 |
| 319 | Alpheratz | Alpheratz.exe: 写真詳細ポップアップ（フルサイズ表示・ワールドリンク・メモ編集） | [ ] | 新規 |
| 320 | Alpheratz | Alpheratz.exe: 写真フォルダパス変更時のDB全パス一括更新処理 | [ ] | 新規 |
| 321 | インストーラー | NSISスクリプト: WM_CLOSE送信・強制展開・Polaris.exeのレジストリ初期登録 | [ ] | 215 |
| 322 | 検証 | 全体ビルドおよびインストーラーでの動作確認 | [ ] | 216 |

---

## 14. 旧LogBackupToolからの変更点（実装上の実際）

本セクションは、旧設計書（v1.0）および旧ツールと、現在の STELLA RECORD 実装との決定的な差異を網羅する。

### 14.1 Polaris.exe (旧 OnsiteLogBackupTool)
| 項目 | 旧仕様 / 旧設計案 | 現在の実装（最新正解） |
|---|---|---|
| **パス解決方式** | exe相対（install_dir） | **%LOCALAPPDATA% 環境変数を直接取得してベースとする** |
| **監視アルゴリズム** | 5秒間隔ポーリング | **3秒間隔（sysinfo による最小コスト監視）** |
| **重複・更新判定** | ファイル名存在チェックのみ | **存在チェック ＋ サイズ/更新日時（modified）比較（追記対応）** |
| **背景実行ロジック** | windows_subsystemのみ | **windows_subsystem ＋ FreeConsole() による完全非表示** |
| **再起動予約** | 起動60秒後維持 | **起動・初期化完了後に即時登録（WinAPI）** |
| **アイコン形式** | .ico 形式 | **.png 形式（imageクレートでRGBA変換してタスクトレイへ）** |
| **マイグレーション** | ディレクトリ移動のみ | **旧 ZIP 展開 ＋ ディレクトリコピーの 2 系統に対応** |

### 14.2 Planetarium.exe (新規・改善)
| 項目 | 旧設計案 | 現在の実装（最新正解） |
|---|---|---|
| **差分判定方式** | ファイル名の HashSet 化 | **SQLite EXISTS 句により 1 ファイルずつ O(1) 検知** |
| **セッション管理** | パース完了後に一元登録 | **ダミー行を先に INSERT ➔ session_id 確定 ➔ 最後に UPDATE** |
| **圧縮アルゴリズム** | デフォルトレベル | **zstd レベル 1（高速・低負荷・リアルタイム優先）** |
| **プライバシー** | 匿名プレイヤーを NULL 保存 | **[User_Masked] / [LocalPlayer] 文字列に置換して保存** |
| **強制Sync** | In-memory 処理 | **tmp_sync/ への物理展開方式（安定性と進捗可視化を重視）** |

---

## 15. 未確定事項

1. **プロダクト配布形態の最終決定**:
   - `Polaris-setup.exe` (バックアップ単体)
   - `STELLARECORD-setup.exe` (UI + DB構築エンジン)
   - `alpheratz-setup.exe` (写真分析ツール)
   - 上記の3パッケージ体制で暫定確定。NSISインストーラーの結合テスト待ち。

---

## 改訂履歴

| バージョン | 日付 | 変更内容 | 担当者 |
|---|---|---|---|
| 0.0.1 | 2026-02-25 | LogBackupTool 仕様書 v1.1.1 初版 | — |
| 0.1.0 | 2026-02-27 | STELLA RECORD 基本仕様書と統合 | — |
| 0.2.0 | 2026-02-27 | PolarisをPolaris.exeデーモンとSTELLA_RECORD GUI管理に分割。LBTAppObserver廃止 | — |
| 0.3.0 | 2026-02-27 | 全仕様確定。Planetarium・Alpheratz・JewelBox・Pleiades詳細仕様追加。バックアップ形式をtar.zstに変更。設定ファイルを個別JSONに分割。stella_core廃止。Virtual Scroll・サムネイルキャッシュ・migrationStatus採用 | — |
| 0.4.0 | 2026-02-27 | planetarium.db 全テーブルスキーマ確定（§6.4〜6.7）。6テーブル・12パースパターン・Privacy/Trackingモード差分・取得不可情報一覧を追加。未確定事項#2を解消 | — |
| 0.5.0 | 2026-02-27 | §0 設計思想・プロダクト戦略を新設。ビジネスモデルキャンバス（顧客セグメント・価値提案・収益モデル・信頼構築戦略）を技術仕様の根拠として統合。設計原則7項目を実装者向け指針として明文化 | — |
| 1.0.0 | 2026-02-28 | **【メジャーリリース・仕様書最終版】** 詳細設計書 (docx) に基づき、Polaris/Planetarium の実装詳細・DB スキーマ・旧ツールからの変更点を全量同期。3秒監視、FreeConsole、[User_Masked] 等の最新実装を仕様として確定 | — |