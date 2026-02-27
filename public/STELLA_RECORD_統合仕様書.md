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

### 1.2 モジュール一覧

| モジュール | 種別 | 概要 | 旧対応 |
|---|---|---|---|
| **STELLA_RECORD.exe** | Tauri SPA メインUI | Polaris設定・Planetarium設定・Pleiades/JewelBoxランチャーを内包するメインアプリ | CAS_LBTSetting.exe + LBTAppObserver.exe |
| **Polaris.exe** | Rust常駐デーモン | VRChat生ログを監視しバックアップする常駐プロセス | OnsiteLogBackupTool.exe |
| **Planetarium.exe** | Rust CLIバイナリ | archiveからDB差分取得・登録・zstd化を行い終了する | 新規 |
| **Alpheratz.exe** | Tauri独立アプリ | 写真とワールド情報を照合・表示・メモ管理するビューアー | 新規 |
| **planetarium.db** | SQLite DB | Planetariumのみ書き込み可能な中核DB | 新規 |
| **Alpheratz.db** | SQLite DB | Alpheratz専用DB（写真メタデータ・メモ） | 新規 |

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
│   │   ├── polaris_appinfo.log        # 起動毎に上書き生成
│   │   └── archive/
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
    ├── PolarisSetting.json            # Polaris設定
    ├── PlanetariumSetting.json        # Planetarium設定
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

## 3. インストーラー仕様（NSIS）

### 3.1 インストール処理フロー

1. **既存インストールの検出** — インストール先フォルダの存在を確認する

2. **既存インストールが存在する場合**
   - 常駐プロセス（Polaris.exe）へ `WM_CLOSE` 送信による正常終了を試みる。`taskkill` による強制終了は行わない
   - `setting/`・`planetarium.db`・`Alpheratz.db`・`archive/` を除く全ファイルを削除する

3. **クリーンインストールの実施**
   - 各実行ファイルおよび各設定JSONの初期値を所定のフォルダへ配置する
   - インストール先は `$LOCALAPPDATA\CosmoArtsStore\STELLARECORD` に強制展開する

4. **レジストリ登録**
   - `HKCU\...\Run` キーへ **Polaris.exe のみ** のフルパスを書き込む（初期値: ON）
   - STELLA_RECORD.exe はスタートアップ登録しない

### 3.2 アンインストール処理

- Polaris.exe へ `WM_CLOSE` 送信により正常終了させる
- レジストリ内のスタートアップ登録値を完全に削除する
- インストールフォルダ全体を削除する

> ※ ユーザーデータ（archive/・planetarium.db・Alpheratz.db）はアンインストール対象外とし、削除しない。

---

## 4. Polaris.exe 詳細仕様（常駐バックアップデーモン）

### 4.1 概要

PCに常駐し、VRChatの生ログファイルを監視・バックアップするデーモン。ウィンドウは表示せず、タスクトレイに常駐する。**データのパース・抽出は一切行わない。ファイルバックアップのみに特化する。**

| 項目 | 内容 |
|---|---|
| 旧名称 | OnsiteLogBackupTool.exe |
| 実装言語 | Rust |
| サブシステム | `windows_subsystem = "windows"`（コンソール非表示） |
| 主要クレート | `tray-icon`（タスクトレイ）、`sysinfo`（プロセス監視） |

### 4.2 動作フロー

#### ① 起動時

- `PolarisSetting.json` を tmp コピーしてから読み込む（STELLA_RECORD.exeによる書き込み中の共有違反を防ぐためのガード）
- 起動時バックアップを実施する
- `RegisterApplicationRestart` を呼び出し、異常終了時の自動再起動をOSへ登録する
  - 「起動から60秒以上経過後のクラッシュ」に対して有効となるよう初期化処理の順序を調整する

#### ② VRChat 起動監視・終了時バックアップ

- `sysinfo` クレートを用い、5秒間隔で `vrchat.exe` のプロセス監視ポーリングを行う
- `vrchat.exe` の起動を検知した場合、「VRC起動中」フラグを立てる
- プロセスの停止を確認した場合、バックアップを実施する

#### ③ ディレクトリ容量監視

- `capacityThresholdBytes` に基づき archiveパスの容量を監視する
- 監視タイミング: **起動時** および **各バックアップ実行直後**
- 閾値超過時は `polaris_appinfo.log` へ警告を出力する

### 4.3 polaris_appinfo.log の仕様

| 項目 | 内容 |
|---|---|
| 出力タイミング | 各バックアップ実行時・容量警告発生時・起動・終了時 |
| ファイル管理 | 起動毎に上書き（`Truncate` モード）。前回ログは保持されない |
| 出力フォーマット | `[YYYY-MM-DD HH:MM:SS] <メッセージ>` |
| 実装 | Polaris.exe が自前で管理（stella_core不使用） |

### 4.4 archiveパス変更処理

`PolarisSetting.json` の `archivePath` が変更された場合、以下の手順で移動処理を実行する。

1. 移動中はSTELLA_RECORD.exeのUI上に警告を表示し、アプリを閉じないよう促す
2. 旧パスから新パスへ**コピー**を実行する
3. コピー成功を確認してから旧パスのフォルダを削除する
4. コピー中にクラッシュした場合は削除を行わない
5. `PolarisSetting.json` の `migrationStatus` で移動状態を管理する（下記参照）
6. `PlanetariumSetting.json` の `archivePath` も自動で同期更新する

**migrationStatus の状態管理:**

| 状態値 | 意味 |
|---|---|
| `"done"` | 移動完了または移動なし（通常状態） |
| `"in_progress"` | 移動中またはコピー後に削除未完了 |

次回起動時に `in_progress` を検知した場合、「前回のパス移動が完了していません」という警告をUIに表示する。

### 4.5 タスクトレイ

- 右クリックメニューに「終了」を設置し、選択時はOS再起動予約を解除してプロセスを正常終了する

### 4.6 異常終了・再起動

| 終了種別 | OS再起動 | 備考 |
|---|---|---|
| 異常終了（クラッシュ等） | あり | `RegisterApplicationRestart` によりOSが自動再起動 |
| 正常終了（タスクトレイ） | なし | ユーザーの意思による停止 |

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

| UI要素 | 対応設定 |
|---|---|
| archiveパス入力 + 変更ボタン | `archivePath`（変更時はフォルダ移動処理を実行） |
| 容量警告閾値入力（GB換算表示） | `capacityThresholdBytes` |
| スタートアップON/OFFトグル | `enableStartup` + レジストリ制御 |
| 手動バックアップボタン | Polaris.exeが未起動かつvrchat.exeが未起動の場合のみ実行可能 |

**ログ監視エリア（旧LBTAppObserver機能）:**

- `polaris_appinfo.log` を **SharedRead モード** で5秒間隔ポーリングして新規行を表示する
- ログファイルのパスは `/app/Polaris/polaris_appinfo.log`（固定）

**設定保存後ポップアップ:**

> 「設定はPolaris.exeには即時反映されません。即時反映する場合、タスクトレイからPolaris.exeを再起動してください。」

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

### 6.1 概要

archiveからログデータを読み込み、`planetarium.db` を生成・更新するCLIバイナリ。処理完了後は終了する（常駐しない）。**`planetarium.db` への書き込み権限を持つのはこのモジュールのみ。**

| 項目 | 内容 |
|---|---|
| 旧名称 | 新規 |
| 実装言語 | Rust |
| 起動元 | STELLA_RECORD.exe（子プロセスとして非同期起動） |
| 終了タイミング | 処理完了後に自動終了 |

### 6.2 通常モード（差分取得）

STELLA_RECORD.exe起動時に実行される通常処理。

1. `PlanetariumSetting.json` の `archivePath` から未処理のraw logを特定する
2. 差分ファイルをパースしてメタデータを抽出する
3. `planetarium.db` に登録する
4. 処理済みのraw logをtar化してzstd圧縮し `archive/zip/` に保存する
   - ファイル名: `YYYYMMDD_HHMMSS.tar.zst`（Planetarium.exe起動時刻）
5. 処理完了をSTELLA_RECORD.exeに通知して終了する

### 6.3 強制Syncモード

STELLA_RECORD.exeのWARNINGエリアから起動される復旧処理。

1. `archive/zip/` 配下のtar.zstファイルを全件取得する
2. 1本ずつ順番に解凍・パース・DB登録を行う
3. 進捗をSTELLA_RECORD.exe側に随時通知する（「N / 全件数 処理中」）
4. ユーザーがキャンセルした場合は処理を中断する（処理済み分はDBに残る）
5. 全件完了またはキャンセル後に終了する

### 6.4 planetarium.db テーブルスキーマ（確定）

#### テーブル一覧

| テーブル名 | 概要 | レコード粒度 |
|---|---|---|
| `app_sessions` | VRChatの起動〜終了を1レコードとするセッション管理 | ログファイル1本 = 1セッション |
| `world_visits` | ワールド訪問記録（セッション内で複数発生） | Entering Room〜OnLeftRoom を1レコード |
| `players` | 同席プレイヤーのマスタ（表示名、オプションでuser_id） | プレイヤー1人 = 1レコード |
| `player_visits` | どのworld_visitにどのplayerが居たかの中間テーブル | OnPlayerJoined〜OnPlayerLeft を1レコード |
| `avatar_changes` | プレイヤーのアバター変更イベント | Switching行1本 = 1レコード |
| `video_playbacks` | ワールド内で再生された動画URL | USharpVideo行1本 = 1レコード |

#### 6.4.1 app_sessions

```sql
CREATE TABLE IF NOT EXISTS app_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time      DATETIME NOT NULL,       -- ログファイル内最初のタイムスタンプ
    end_time        DATETIME,                -- ログファイル内最後のタイムスタンプ
    my_user_id      TEXT,                    -- 自分のusr_ID（Trackingモード時のみ保存）
    my_display_name TEXT,                    -- 自分の表示名
    vrchat_build    TEXT,                    -- VRChatのビルドバージョン文字列
    log_filename    TEXT UNIQUE NOT NULL      -- 処理済みログファイル名（重複インポート防止キー）
);
```

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `start_time` | ログファイル内で最初にタイムスタンプを持つ行 | — |
| `end_time` | ログファイル内で最後にタイムスタンプを持つ行 | — |
| `my_user_id` | `User Authenticated: (表示名) (usr_xxx)` | **Privacyモード時は NULL** |
| `my_display_name` | 同上から表示名を抽出 | — |
| `vrchat_build` | `VRChat Build: (ビルド文字列)` | タイムスタンプ無し行のため専用処理が必要 |
| `log_filename` | ファイル名そのもの（`output_log_YYYY-MM-DD_HH-MM-SS.txt`） | 1ファイル1セッションを保証 |

#### 6.4.2 world_visits

```sql
CREATE TABLE IF NOT EXISTS world_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,        -- 所属セッション
    world_name      TEXT NOT NULL,            -- ワールド表示名
    world_id        TEXT NOT NULL,            -- wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    instance_id     TEXT NOT NULL,            -- フルインスタンスID文字列
    access_type     TEXT,                     -- public / friends / private / hidden / group
    instance_owner  TEXT,                     -- インスタンス所有者のusr_ID（Trackingモード時のみ）
    region          TEXT,                     -- jp / us / eu / use 等
    join_time       DATETIME NOT NULL,        -- 入室日時
    leave_time      DATETIME,                -- 退室日時（OnLeftRoom or 次回Entering Room時に更新）
    FOREIGN KEY(session_id) REFERENCES app_sessions(id)
);
```

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `world_name` | `[Behaviour] Entering Room: (ワールド名)` | Joining行より先に出力される |
| `world_id` | `[Behaviour] Joining wrld_xxx:インスタンス番号~アクセス種別~region(リージョン)` | 正規表現で分解 |
| `instance_id` | 同上のフル文字列を結合して保存 | `wrld_xxx:12345~friends(usr_xxx)~region(jp)` 形式 |
| `access_type` | 同上のアクセス種別部分（`private` / `friends` / `hidden` / `public` / `group`） | — |
| `instance_owner` | アクセス種別内の `(usr_xxx)` 部分 | **Privacyモード時は NULL** |
| `region` | `~region(jp)` 部分 | — |
| `join_time` | Joining行のタイムスタンプ | — |
| `leave_time` | `[Behaviour] OnLeftRoom` のタイムスタンプ、または次の `Entering Room` のタイムスタンプ、またはログ末尾のタイムスタンプ | — |

#### 6.4.3 players

```sql
CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT UNIQUE,             -- usr_ID（Trackingモード時のみ保存、Privacyモード時はNULL）
    display_name    TEXT NOT NULL             -- プレイヤー表示名
);
```

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `user_id` | `[Behaviour] OnPlayerJoined (表示名) (usr_xxx)` | **Privacyモード時は NULL**。Trackingモード時は `ON CONFLICT(user_id) DO UPDATE SET display_name` で最新名を維持 |
| `display_name` | 同上 | Privacyモード時は表示名のみで INSERT（同名が既存なら重複しない） |

#### 6.4.4 player_visits

```sql
CREATE TABLE IF NOT EXISTS player_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL,        -- 紐づくworld_visits.id
    player_id       INTEGER NOT NULL,        -- 紐づくplayers.id
    is_local        BOOLEAN NOT NULL DEFAULT 0,  -- 自分自身のプレイヤーかどうか
    join_time       DATETIME NOT NULL,        -- そのワールドに参加した日時
    leave_time      DATETIME,                -- そのワールドから退出した日時
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);
```

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `visit_id` | `OnPlayerJoined` 発生時点の `current_visit_id` | — |
| `player_id` | playersテーブルのidをLOOKUP | — |
| `is_local` | `[Behaviour] Initialized PlayerAPI "表示名" is local` | local の場合 `1`、remote の場合 `0`（デフォルト） |
| `join_time` | `OnPlayerJoined` のタイムスタンプ | — |
| `leave_time` | `[Behaviour] OnPlayerLeft (表示名) (usr_xxx)` のタイムスタンプ | OnLeftRoomやログ末尾で一括closeもあり |

#### 6.4.5 avatar_changes

```sql
CREATE TABLE IF NOT EXISTS avatar_changes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id          INTEGER NOT NULL,      -- 紐づくworld_visits.id
    player_id         INTEGER,               -- 紐づくplayers.id（未解決時NULL）
    display_name_raw  TEXT NOT NULL,          -- ログに記録された生の表示名
    avatar_name       TEXT NOT NULL,          -- アバター名称
    timestamp         DATETIME NOT NULL,      -- 変更日時
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);
```

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `display_name_raw` | `[Behaviour] Switching (表示名) to avatar (アバター名)` | player_idが紐付かない場合のフォールバック |
| `avatar_name` | 同上 | avtr_IDは含まれない（ログに出力されないため） |
| `player_id` | display_nameでplayersテーブルをLOOKUP | 紐付け失敗時はNULL |

#### 6.4.6 video_playbacks

```sql
CREATE TABLE IF NOT EXISTS video_playbacks (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id          INTEGER NOT NULL,      -- 紐づくworld_visits.id
    player_id         INTEGER,               -- リクエストしたプレイヤー（判明時のみ）
    display_name_raw  TEXT,                   -- リクエスト者の表示名（判明時のみ）
    url               TEXT NOT NULL,          -- 再生されたURL
    timestamp         DATETIME NOT NULL,      -- 再生開始日時
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);
```

| カラム | パース元ログ行 | 備考 |
|---|---|---|
| `url` | `[USharpVideo] Started video load for URL: (URL), requested by (表示名)` | — |
| `display_name_raw` | 同上の `requested by` 部分 | alt形式（下記）ではリクエスト者不明 |
| — | `[USharpVideo] Started video: (URL)` | alt形式。リクエスト者情報なし |

> **⚠️ 実装上の注意:** 実際のログでは `[USharpVideo]` ではなく `[<color=#9C6994>USharpVideo</color>]` と Unity Rich Text タグ付きで出力される。正規表現はタグを考慮する必要がある。

### 6.5 パース対象ログ行パターン一覧

以下はVRChat `output_log_*.txt` から抽出する全ログ行パターンの一覧。

| # | パターン | 正規表現 | 抽出先テーブル |
|---|---|---|---|
| 1 | タイムスタンプ | `^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})` | 全行の時刻基準 |
| 2 | ユーザー認証 | `User Authenticated: (.*?) \((usr_.*?)\)` | `app_sessions` |
| 3 | ビルド情報 | `VRChat Build: (.*)` | `app_sessions` |
| 4 | ワールド入室（名前） | `\[Behaviour\] Entering Room: (.*)` | `world_visits` (world_name) |
| 5 | ワールド入室（ID） | `\[Behaviour\] Joining (wrld_.*?)(?::(.*?))?~((?:private\|friends\|hidden\|public\|group).*?)(?:~region\((.*?)\))?$` | `world_visits` |
| 6 | ワールド退室 | `\[Behaviour\] OnLeftRoom` | `world_visits` (leave_time更新) |
| 7 | プレイヤー参加 | `\[Behaviour\] OnPlayerJoined (.*?) \((usr_.*?)\)` | `players` + `player_visits` |
| 8 | プレイヤー退出 | `\[Behaviour\] OnPlayerLeft (.*?) \((usr_.*?)\)` | `player_visits` (leave_time更新) |
| 9 | プレイヤー初期化 | `\[Behaviour\] Initialized PlayerAPI "(.*?)" is (local\|remote)` | `player_visits` (is_local更新) |
| 10 | アバター変更 | `\[Behaviour\] Switching (.*?) to avatar (.*)` | `avatar_changes` |
| 11 | 動画再生（詳細） | `\[USharpVideo\] Started video load for URL: (.*?), requested by (.*)` | `video_playbacks` |
| 12 | 動画再生（簡易） | `\[USharpVideo\] Started video: (.*)` | `video_playbacks` |

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
| `archivePath` | string | 参照するarchiveフォルダのパス。PolarisSetting変更時に自動同期更新される | `""` |
| `dbPath` | string | planetarium.db の保管パス（空 = デフォルト） | `""` |

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

## 14. 旧LogBackupToolからの変更点

| 変更種別 | 旧（LogBackupTool） | 新（STELLA RECORD） |
|---|---|---|
| 名称変更 | OnsiteLogBackupTool.exe | Polaris.exe（常駐デーモン） |
| 名称変更+機能統合 | CAS_LBTSetting.exe | STELLA_RECORD.exe（Polarisセクションに統合） |
| 廃止・統合 | LBTAppObserver.exe | 廃止 → STELLA_RECORD.exeのログ表示エリアに統合 |
| 分割 | Config.json（単一） | 複数の個別JSON（PolarisSetting.json等）に分割 |
| 廃止 | lbt_core（共通ライブラリ） | 廃止。各モジュールが自前で実装 |
| 名称変更 | appinfo.log | polaris_appinfo.log |
| 形式変更 | output_log_YYYYMMDD_HHMMSS.txt（平テキスト） | YYYYMMDD_HHMMSS.tar.zst（圧縮アーカイブ） |
| パス変更 | %LOCALAPPDATA%\CosmoArtsStore\LogBackupTool | %LOCALAPPDATA%\CosmoArtsStore\STELLARECORD |
| 新規追加 | — | Planetarium.exe + planetarium.db（SQLite） |
| 新規追加 | — | Alpheratz.exe（写真ビューアー・メモ管理） |
| 新規追加（後日） | — | JewelBox 外部アドオン連携仕様の詳細化 |

---

## 15. 未確定事項

| # | 内容 | 影響範囲 | ステータス |
|---|---|---|---|
| #1 | `archivePath` が空のときのデフォルトパスのフォールバック定義（実装時に確定） | Polaris.exe・Planetarium.exe | 未確定 |
| #2 | ~~`planetarium.db` のテーブル構成~~ | ~~Planetarium.exe・Alpheratz.exe~~ | **✅ 解決済み（§6.4〜6.7で全量確定）** |

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