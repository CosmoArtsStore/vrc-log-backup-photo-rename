# STELLARECORD 全仕様ロジック詳細設計書
> バージョン: 3.0.0
> 作成日: 2026-02-27
> 対象: StellaRecord プロジェクト全アーキテクチャ・データベース・通信・UI仕様

---
## 目次
1. [プロジェクト基本理念と設計原則](#1-プロジェクト基本理念と設計原則)
2. [システムアーキテクチャとディレクトリ構造](#2-システムアーキテクチャとディレクトリ構造)
3. [Polaris.exe 詳細設計書](#3-polarisexe-詳細設計書)
4. [Planetarium.exe 詳細設計書](#4-planetariumexe-詳細設計書)
5. [STELLA_RECORD.exe 詳細設計書](#5-stella_recordexe-詳細設計書)
6. [Alpheratz.exe 詳細設計書](#6-alpheratzexe-詳細設計書)
7. [データベース スキーマ（最終定義）](#7-データベース-スキーマ最終定義)

---

## 1. プロジェクト基本理念と設計原則

StellaRecordは、VRChatのログシステムからユーザーの活動記録をローカル環境に永続化し、写真データとともに振り返ることができる「ローカルファースト・プライバシー重視」の統合ログ管理スイートである。

### 1.1 7つの設計原則（The 7 Core Principles）
本プロジェクトのいかなる拡張・改修においても、以下の原則は絶対的に遵守されなければならない。

1. **One-Way Data Flow（一方向データフロー）**
   - VRChatログ → (コピー) → Polarisアーカイブ → (パース) → Planetarium DB → (読み取り専用) → UIモジュール
   - 上流のデータ（特にVRChatの生ログやアーカイブ）を書き換えることは一切禁止。
2. **No External APIs（外部API通信の禁止）**
   - VRChat API、Discord API、その他の外部クラウドサービスへの通信を一切禁止する。完全オフライン動作を保証する。
3. **No Authentication（認証不要）**
   - アカウント作成、ログイン、トークン管理などの概念を持たない。
4. **Privacy First（行動トラッキングの分離）**
   - 他ユーザーの行動（Join/Leave）を記録する機能は明示的なオプトイン（Trackingモード）とする。デフォルトのPrivacyモードでは、他者の `user_id`（usr_***）やインスタンスオーナー情報は一切DBに保存しない（NULLとして記録）。
5. **Write-Once Database（データベースの単一書込責任）**
   - `planetarium.db` への書き込み権限を持つのは `Planetarium.exe` のみ。UIモジュール（STELLA_RECORD, Alpheratzなど）はすべて読み取り（SELECT）のみを行い、WALモードで排他制御を回避する。
6. **No File Mutation（ユーザーファイルの不可侵）**
   - 写真ビューアー（Alpheratz）を含むすべてのツールは、ユーザーの写真ファイルの実体に対するリネーム、移動、削除を行わない。
7. **Crash Recovery & Silent Operation（確実な復旧と静音動作）**
   - バックグラウンドプロセス（Polaris等）はタスクトレイにのみ常駐し、ユーザーの邪魔をしない。Windowsの `RegisterApplicationRestart` を用いた自動復旧機構を持つ。

---

## 2. システムアーキテクチャとディレクトリ構造

### 2.1 ディレクトリ階層設計
Windowsユーザー環境において、設定ファイルとアプリケーションデータは以下のように配置される。環境変数 `%LOCALAPPDATA%` を起点とする。

```text
%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\
 ├── setting\                                  # 各モジュールの設定ファイル
 │   ├── PolarisSetting.json
 │   ├── PlanetariumSetting.json
 │   └── STELLA_RECORD_Setting.json
 │
 └── app\
     ├── Polaris\
     │   ├── archive\                          # VRChat生ログのコピーストック
     │   │   ├── output_log_12-34-56.txt ...
     │   └── polaris_appinfo.log               # Polarisの稼働・エラーログ
     │
     ├── Planetarium\
     │   └── planetarium.db                    # 履歴が詰まったSQLiteデータベース
     │
     └── Alpheratz\
         ├── AlpheratzSetting.json             # ビューアーの設定
         ├── Alpheratz.db                      # 写真と照合結果のDB
         └── thumbnail_cache\                  # 生成された写真のサムネイル
```

---

## 3. Polaris.exe 詳細設計書
**対象モジュール: `polaris.exe`**
**設計対象: 起動初期化〜ポーリングループ〜コピーアーカイブ〜容量監視の全処理フロー**
**技術スタック: Rust / sysinfo / tray-icon / winapi**

### 3.1 起動エントリポイントと呼び出し元の関係
Polaris.exeは、STELLA_RECORD.exeに依存せずWindows起動時（または手動キック）に単独でバックグラウンド実行されるデーモンである。コンソールを持たず（`windows_subsystem = "windows"`）、タスクトレイアイコンのみを提供する。Windows レジストリによりログイン時に自動起動する。

### 3.2 構成変数と設定データの初期化
起動直後の `main()` 内で、以下の変数が初期化される。

| 変数名 | 型 | 初期値 | 用途 |
|---|---|---|---|
| `setting` | `PolarisSetting` | JSONからパース | 設定値全体（容量閾値、アーカイブパス等）保持 |
| `event_loop` | `EventLoop` | `EventLoopBuilder` | タスクトレイとアプリケーションループの基盤 |
| `menu` | `Menu` | `Menu::new()` | トレイアイコンの右クリックメニュー構成 |
| `quit_id` | `MenuId` | `quit_item.id()` | 「終了」クリックの検知用ID |
| `sys` | `sysinfo::System` | `System::new_all()` | プロセス一覧をポーリングするためのOS情報コンテキスト |
| `last_vrchat_running` | `bool` | `false` | VRChatの終了検知（エッジ検出）用の前回状態保持 |

**【Phase 1: クラッシュリカバリ登録】**
アプリケーション開始の最序盤に `winapi::um::winbase::RegisterApplicationRestart(null(), 0)` を呼び出し、不慮の終了時にOSに60秒後に自身のプロセスを再起動させる。引数 `0` はハング・クラッシュなどのすべての理由に対して再起動を許可する。

**【Phase 2: 設定ファイル読み込みの排他制御ガード（ロック回避）】**
1. `fs::copy(PolarisSetting.json, PolarisSetting.json.tmp)` にてテンポラリを作る。
2. 作成したテンポラリファイルを開き、`BufReader` 経由で `serde_json::from_reader` を実行。
3. すぐに `.tmp` ファイルを削除する。
これにより、STELLA_RECORD_UI アプリ側が `PolarisSetting.json` を開いたまま書き込んでいる最中でも、PolarisがSharing Violation（共有違反エラー）でクラッシュするのを防ぐ。

### 3.3 タスクトレイの構築と常駐ループ（メインスレッド）
1. `tray_icon::TrayIconBuilder::new().with_menu(...)` を使ってアイコンをタスクトレイに確保する。ツールチップには "Polaris - VRChat ログバックアップ" を設定。
2. `MenuEvent::receiver()` でトレイからのメッセージ送受チャネルを開く。
3. 同時に、無限ループを行う **監視スレッド (`thread::spawn`)** を別に切り出して裏で実行開始させる。
4. `event_loop.run(move |_event, _, control_flow| { ... })` にてメインスレッドを待機モード (`ControlFlow::Wait`) に移す。
5. メインループ内では `menu_channel.try_recv()` によりメニュークリックを監視し、`menu_event.id == quit_id` の場合のみ `ControlFlow::Exit` を返して安全に終了する。

### 3.4 ポーリングループ（監視スレッド）非同期起動
タスクトレイとは別のバックグラウンドスレッドで実行される本体ロジック。

**【Phase 1: インターバル】**
無限ループの先頭で `thread::sleep(Duration::from_secs(5))` を実行し、CPUの消費を極小化する。

**【Phase 2: プロセス列挙と部分位置マッチ】**
1. `sys.refresh_processes()` で内部プロセスリストを更新。
2. `sys.processes().values()` の中から `process.name().to_lowercase().contains("vrchat")` を満たすプロセスを探す。合致するものが1つでもあれば `current_running = true`。

**【Phase 3: エッジトリガ判定】**
- **IF `!current_running && last_vrchat_running` （true → false への遷移）**:
  VRChatの終了をエッジとして検知。
  1. ロガーに `[INFO] VRChat.exe closed. Triggering backup.`
  2. `run_backup_job(&setting)` （アーカイブ処理）を実行。
  3. `check_capacity(&setting)` （容量監視）を実行。
- **IF `current_running && !last_vrchat_running` （false → true への遷移）**:
  起動検知（機能的にはロギングのみ）。
- 判定完了後、`last_vrchat_running = current_running` に更新してループの先頭に戻る。

※また、デーモン自体の**プロセス起動直後**にも1回無条件で `run_backup_job` と `check_capacity` が発火し、起動していない間の取りこぼしを回収する。

### 3.5 バックアップ処理（Archive Logic）の詳細
関数 `run_backup_job(&setting)` の内部挙動。

1. **パス解決**: ソース元は `env::var("USERPROFILE")\AppData\LocalLow\VRChat\VRChat`。ターゲットは `setting.archivePath`。
2. **走査と差分コピー**:
   `fs::read_dir(source_dir)` を回し、`output_log_*.txt` ファイルだけを対象とする。
   ループごとに `target_path` を構築し、`fs::metadata(target_path)` でコピー先を確認。

   【コピーが発火する条件】
   - 『ターゲット側にファイルが存在しない（`metadata`取得がエラーになる）』
   - 『ターゲット側の `modified` より、ソース側の `modified` タイムスタンプが新しい（`source_mtime > target_mtime`）』

   条件に合致すれば `fs::copy(source_path, target_path)` で上書きまたは新規コピーを行う。コピー完了件数をカウントしログに出す。この「差分更新」によって同じファイルを無駄に上書きしない。

### 3.6 容量チェックメカニズム
関数 `check_capacity(&setting)` の内部挙動。バックアップ実行の直後に必ず走る。
1. `walkdir` イテレータを用いて `setting.archivePath` ディレクトリ以下の全てのファイルの総容量（バイト数）を合計する。再帰的に合計（ディレクトリサイズ自体の寄与は無視してファイルサイズだけ集計）。
2. 合計値と `setting.capacityThresholdBytes` を比較。
3. もし容量を超過していれば、`polaris_appinfo.log` に対して `[WARNING] The archive folder size exceeds the threshold` を書き込む。現行システムでは自動削除や圧縮を行わず、STELLA_RECORDのUIでトースト警告を出すための証跡だけ残す。

---

## 4. Planetarium.exe 詳細設計書
**対象モジュール: `planetarium.exe`**
**設計対象: DB構築・差分インポート・ステートマシンパースの全処理フロー**
**技術スタック: Rust / rusqlite / regex**

### 4.1 起動エントリポイントと呼び出し元の関係
Planetarium.exe は定常稼働する常駐ソフトではない。タスクスケジューラにより指定時刻に起動されるか、STELLA_RECORD のUI上から同期/非同期コマンドで呼び出されてバッチ的に起動されるデータ流し込みプロセッサである。

### 4.2 DBの初期化ならびにWAL構築
`main()` 関数起動時の挙動。

1. `PlanetariumSetting.json` をロード。`enableUserTracking` （トラッキングモードのON/OFF）のBool変数を確保。
2. SQLiteコネクションの確立: `rusqlite::Connection::open(db_path)`。
3. **WAL / パフォーマンス設定の発行**
   - `PRAGMA synchronous = NORMAL;` 
   - `PRAGMA journal_mode = WAL;`
   - これらのPRAGMAはファイルレベルでのDBロックを避ける。これがなければ、Planetariumが処理している数秒間、Alpheratz.exeなどが検索クエリでスタックしてしまう。
4. **テーブル生成**: 6テーブル定義に従う（後述第7章参照）。

### 4.3 Phase 1: インポート対象ファイルの O(1) 抽出
毎回のバッチ起動の際、アーカイブディレクトリ内にある何千個ものテキストログをパースし直していては計算量が爆発する。そのため以下の「Skipping Logic」を組む。

1. `let current_entries: HashSet<String> = SELECT log_filename FROM app_sessions` で、過去に一度でもパースを通った（＝DBに存在する）ファイル名リストを作る。
2. `fs::read_dir(archive_path)` を走査し、`output_log_*.txt` にマッチするファイル群を得る。
3. 上記のファイル群から `current_entries` に合致しないもの**だけ**を `Vec<PathBuf>` へプッシュする（これが今回新たにパースすべき差分ファイル群＝`target_files`）。
4. `target_files.sort()` で辞書順（＝日付順）にソートする。

以後の処理（パイプライン）は、この `target_files` に入った一件一件に対して順方向のループで回る。

### 4.4 Phase 2: プリスキャン (メタデータ抽出と Session INSERT)
対象ファイル一件につき、**まず先頭からEOFまで一通り空読みする（1回目のパース）**。
これは、ログの走査の途中でファイルが破損・強制終了などで切れていたりした場合でも、セッション全体（アプリ通しての）のメタデータを先に確定させるため。

**【抽出用変数 (型 `Option<String>`)】**
1. `start_time`: 正規表現 `^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}` に合致した**最初の**日時
2. `end_time`: 上記パターンの**最後の**日時（ループごとに上書きされる）
3. `vrchat_build`: `VRChat Build: (.*)`
4. `my_display_name`: `User Authenticated: (.*?) \(usr_.*?\)` より $1
5. `my_user_id`: 同じく $2。**ただし、`setting.enableUserTracking` が false の場合は Privacyモードとして `None` のままにする**。

全行読み込み後、得られた変数を用いて `INSERT OR IGNORE INTO app_sessions (start_time, end_time, my_user_id, my_display_name, vrchat_build, log_filename)` を実行。同時に `SELECT id` でこのテーブル主キーである `session_id` を確保する。（`log_filename`のUNIQUE制約により冪等性を保証）

### 4.5 Phase 3: メインパース (状態遷移ステートマシン)
ファイルを2回目のオープンで頭から再読込し、状態変異（State Machine）を使いながら12カテゴリの正規表現ルーターでパースする。

**【状態維持変数の定義】**
| 変数名 | 型 | 定義と役割 |
|---|---|---|
| `current_ts` | `Option<NaiveDateTime>` | 各行の行頭の日時。全てのインサートはこの値をタイムスタンプとする |
| `current_visit_id` | `Option<i64>` | `world_visits` のPK。どの部屋に「今」いるかを示す |
| `pending_room_name` | `Option<String>` | `Entering Room` を引金に保持される、直後の `Joining` 用バッファ |

**【行ごとの正規表現ルーター設計】**
1. **時刻 (Time)**:
    `^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}` に合致すれば `current_ts` 上書き。合致しない行は直前の `current_ts` を踏襲する。
2. **Entering Room**:
   `\[Behaviour\] Entering Room: (.*)`
   - 新しい部屋へ入る前兆。マッチしたグループ $1 を `pending_room_name` に保持。
   - **例外処理のクローズ**: このときもし `current_visit_id` が既に存在していれば、ログ出力の不整合（または強制クラッシュからの復帰）により、前の部屋の退室処理がすっ飛ばされている。直ちに DBクエリで `UPDATE world_visits SET leave_time = current_ts WHERE id = current_visit_id` を発行し、強制的に退室として処理する。そして `current_visit_id = None` にする。
3. **Joining**:
   `\[Behaviour\] Joining (wrld_.*?)~(private|friends|...)(?:~region\((.*?)\))?`
   - 合致した場合、`pending_room_name` と `world_id` , `access_type`, `region` を使って `world_visits` テーブルに INSERT する。
   - ※ここでも `instance_owner` （usr_等）が含まれるフォーマットの場合は抽出し、追加で `tracking_mode` が false なら NULL で握り潰す設定。
   - INSERTした `rowid` を `current_visit_id` として取得。`pending_room_name = None` へリセット。
4. **OnLeftRoom**:
   `\[Behaviour\] OnLeftRoom`
   - コンソール上でのワールド退室。滞在中の `current_visit_id` に対して `UPDATE world_visits SET leave_time` で時刻を入れ、`current_visit_id = None` にする。
5. **OnPlayerJoined / OnPlayerLeft**:
   `(DisplayName) (usr_xxx)`
   - 他プレイヤーの入退室。`tracking_mode` に基づき `usr_xxx` の保存可否を決定。
   - `players` マスタテーブルに `INSERT OR IGNORE` し、`SELECT id` で人物ID取得。
   - 交差テーブル `player_visits` に該当人物IDでの出入りを INSERT ないし UPDATE(leave) する。
6. **その他 (Avatar変更, Video再生)**:
   それぞれ `\[Behaviour\] Switching (.*?) to avatar (.*)` などからパラメータを抽出し、`current_visit_id` に紐づく実績としてインサートする。

最終行まで読み終えたのち、もし `current_visit_id` が残った状態であれば強制終了したとみなし、ファイルの終わりの時刻(`end_time`)を用いて `leave_time` を UPDATE クローズする。

---

## 5. STELLA_RECORD.exe 詳細設計書
**対象モジュール: `stella_record_ui`**
**設計対象: 統合コンソールUI・状態管理・手動バックアップ フロー**
**技術スタック: Tauri v2 / React 18 / Vite / sysinfo / winreg**

### 5.1 モジュールの役割と通信フロー
STELLA_RECORD は Tauri ベースのReact SPAアプリケーションである。本プロセスそのものはDBへの書き込みやアーカイブの定常監視等を直接行わない「コントロールパネル」である。

- **状態変数の取得 (起動時)**
  - フロントの `useEffect` で `invoke("get_polaris_setting")`, `invoke("get_planetarium_setting")` 等を実行。バックエンドのRustは各JSONのデシリアライズ内容を返す。
  - 返却値は React のステート (`useState` 等) にマウントされ、スライダーやトグルUIにバインドされる。
- **設定の保存 (手動/自動)**
  - 「保存ボタン」押下時に変更値をもとに `invoke("save_config")`。
  - Rust内で再シリアライズされ 各 `.json` が不可逆上書きされる。

### 5.2 OSスタートアップへの自動登録（`RegisterStartup` コマンド）
ユーザーがUI上で「Windows起動時に自動起動（Polarisデーモン）」トグルを操作した際のフロー。

**フロントエンドの動作**
Toggleの `onChange` で直ちに `invoke("toggle_startup", { enable: true/false })` を発行。

**バックエンド（Rust）の動作**
1. `winreg` クレートを用いて、Windowsのレジストリ `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run` を書き込み権限で開く。
2. **ON (true) の場合**:
   値名 `"StellaRecord_Polaris"` として、自分自身（`stella_record.exe`）のパスの隣にある子ディレクトリ（`app\Polaris\Polaris.exe`）の絶対パスを合成解決し、REG_SZデータとして `set_value` を発行する。
3. **OFF (false) の場合**:
   `delete_value("StellaRecord_Polaris")` する。エラー（存在しない等）は無視（`let _ = ...`）。

これによって、UIである STELLA_RECORD がスタートアップ起動するのではなく、バックグラウンドの監視デーモン Polaris だけが安全に起動する機構を実現する。

### 5.3 手動バックアップキック処理シーケンス
ユーザーがUIから「いまのVRChatログをバックアップ」ボタンを押下した場合の整合性担保フロー。

**フロントエンド**: `invoke("manual_backup")` を発行して待機状態（ローダー表示）に入る。
**バックエンド（Rust）**:
【Phase 1: 稼働競合の完全チェック】
1. `sysinfo::System::new_all()` によって現状のプロセスリストを取得。
2. `name("vrchat")` を検索: 該当がある場合は `Err("VRChatが起動中です。バックアップは終了時まで待機してください。")` を返す。ログファイルが VRChat からロックされているか、追記中の最中であることを意味するため、中途半端な強制コピーを避ける。（設計原則）
3. `name("polaris")` を検索: Polarisデーモンが常駐稼働している場合は `Err("Polarisデーモンが稼働中です。自動検知と競合します。")` としてリジェクトする。

【Phase 2: ダイレクトコピールーチン】
上記の両者がプロセスリストにいない場合のみ、Tauriバックエンド内で（普段はPolarisがやる役割である）`read_dir` -> `modified` タイムスタンプ比較・新規/追記差分判定 -> `fs::copy` というアーカイブの走査処理ロジックを回す。

処理終了後、コピーしたファイル数 `processed_count` をフロントに `Ok(count)` と返し、フロントはトースト表示を行う。

---

## 6. Alpheratz.exe 詳細設計書
**対象モジュール: `pleiades_alpheratz`**
**設計対象: 起動時スキャン〜DB構築〜UI描画 全フロー**

*(※このセクションの設計内容は「参考詳細設計書」のフローと完全に一致し、Alpheratz.exe は写真リネームを行わず、`Alpheratz.db` に照合結果のみを永続化し、仮想スクロールでReactフロントエンドへ描画させるアーキテクチャである。)*

1. **DB構築**: `setup` にて `AlpheratzDb` を初期化（`WAL` 化、`photos` の CREATE TABLE）。
2. **走査と差分**: `photoFolderPath` の全ファイルから、SQLiteに存在しない分だけを抽出（O(1) マッチング）。
3. **照合**: Planetarium DB に接続し `WHERE join_time <= ? AND (leave_time IS NULL OR leave_time >= ?)` でワールド名を特定。
4. **生成**: `thumbnail(360, 360)` メソッドでキャッシュ画像を作りながら `photos` テーブルにインサートし、非同期でReact側に進行度(0~100)を流す。
5. **描画**: Reactは `get_photos` でPhotoCard配列を受け取り、`react-window` でVirtual Scroll描画。サムネイルは `convertFileSrc` でローカルブラウザスキーム経由で描画。

---

## 7. データベース スキーマ（最終定義）

各々 SQLite3 の構造。これらは「Write-Once」原則に基づき、設計されたバッチからのみ書き込まれ、UIツールはRead-Only接続を行う。

### 7.1 Planetarium DB (`planetarium.db`)

1. **app_sessions** (1ログ = 1セッション)
   - `id` (INTEGER PK AUTOINCREMENT)
   - `start_time` (DATETIME NOT NULL) : 最初のタイムスタンプ行
   - `end_time` (DATETIME NULL) : 最後のタイムスタンプ行
   - `my_user_id` (TEXT NULL) : Trackingモード依存
   - `my_display_name` (TEXT NULL)
   - `vrchat_build` (TEXT NULL)
   - `log_filename` (TEXT UNIQUE NOT NULL) : 重複防止のメインキー（O(1) 冪等性保証用の最重要カラム）

2. **world_visits** (ワールド滞在)
   - `id` (INTEGER PK AUTOINCREMENT)
   - `session_id` (INTEGER NOT NULL FK)
   - `world_name` (TEXT NOT NULL)
   - `world_id` (TEXT NOT NULL) : wrld_...
   - `instance_id` (TEXT NOT NULL) : wrld_...:1234 等
   - `access_type` (TEXT NULL) : private, public...
   - `instance_owner` (TEXT NULL) : Trackingモード依存
   - `region` (TEXT NULL) : jp, usw...
   - `join_time` (DATETIME NOT NULL)
   - `leave_time` (DATETIME NULL) : これが NULL であるとき、クラッシュや不正終了とみなされ Alpheratz等では未来永劫居座っているものとして扱うセーフバックが成される

3. **players** (遭遇した他プレイヤー)
   - `id` (INTEGER PK AUTOINCREMENT)
   - `user_id` (TEXT UNIQUE NULL) : Trackingモード依存。NULL可にすることでPrivacy時に大量のNULL（匿名者）インサートを同じ主キー衝突とみなさないようにする
   - `display_name` (TEXT NOT NULL)

4. **player_visits** (誰がどのワールドにいついたか)
   - `id` (INTEGER PK AUTOINCREMENT)
   - `visit_id` (INTEGER NOT NULL FK)
   - `player_id` (INTEGER NOT NULL FK)
   - `is_local` (BOOLEAN NOT NULL DEFAULT 0) : 自身であることを示すフラグ
   - `join_time` (DATETIME NOT NULL)
   - `leave_time` (DATETIME NULL)

5. **avatar_changes** / **video_playbacks** (出来事ログ)
   - 共通フィールド: `id`, `visit_id`, `player_id` (FK:NULL可能), `display_name_raw`, `timestamp`
   - 特有フィールド: `avatar_name` (TEXT NOT NULL) または `url` (TEXT NOT NULL)

### 7.2 Alpheratz DB (`Alpheratz.db`)

1. **photos** (写真メタデータとワールド照合の紐づけ結果)
   - `photo_filename` (TEXT PRIMARY KEY) : 重複インサート防止用。例 `VRChat_2024-xxx.png`
   - `photo_path` (TEXT NOT NULL) : 画像実体の絶対パス
   - `world_id` (TEXT NULL) : 照合成功時は `wrld_xxx`、失敗時はNULL
   - `world_name` (TEXT NOT NULL) : `ワールド不明` などのフォールバックテキストを含む
   - `timestamp` (DATETIME NOT NULL) : `YYYY-MM-DD HH:MM:SS.mmm`
   - `memo` (TEXT NOT NULL DEFAULT '') : ユーザーノート

---
*(EOF - STELLARECORD Logic Specification v3.0.0)*
