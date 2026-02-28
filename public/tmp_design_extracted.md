**STELLA RECORD**

**詳細設計書**

Polaris.exe / Planetarium.exe

対象バージョン: 1.0.0（Polaris）/ 0.1.0（Planetarium）

技術スタック: Rust / SQLite (rusqlite) / zstd / tar / sysinfo /
tray-icon / tao

**本設計書は実装コードを正として記述した最終版**

作成日: 2026-02-28

CosmoArtsStore

**1. Polaris.exe 詳細設計書**

常駐バックアップデーモン --- VRChat 生ログ監視・保全エンジン

**1.1 概要**

  --------------------------------------------------------------------------------------------------------
  **項目**               **内容**
  ---------------------- ---------------------------------------------------------------------------------
  旧名称                 OnsiteLogBackupTool.exe

  実装言語               Rust（edition = 2021）

  バージョン             1.0.0

  Windows サブシステム   #\![windows_subsystem = \"windows\"\]（コンソール非表示）

  依存クレート（主要）   sysinfo（プロセス監視）、tray-icon +
                         tao（タスクトレイ）、walkdir（再帰走査）、zip（ZIP
                         展開）、image（アイコン画像読み込み）、winapi（SharedRead/Restart
                         API）、chrono、serde / serde_json

  設定ファイル格納先     %LOCALAPPDATA%\\CosmoArtsStore\\STELLARECORD\\setting\\PolarisSetting.json

  ログファイル格納先     %LOCALAPPDATA%\\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\polaris_appinfo.log

  常駐性                 タスクトレイに常駐し、メニュー「終了」選択またはOS再起動まで動作し続ける
  --------------------------------------------------------------------------------------------------------

**1.2 パス解決の方式**

Polaris.exe は install_dir（exe の相対パス）を使用しない。すべてのパスは
%LOCALAPPDATA% 環境変数を std::env::var(\"LOCALAPPDATA\")
で取得してベースとする。

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **対象**               **解決方法**                                                        **結果パス例**
  ---------------------- ------------------------------------------------------------------- ---------------------------------------------------------------------------------------------------
  PolarisSetting.json    %LOCALAPPDATA% +                                                    C:\\Users\\kaimu\\AppData\\Local\\CosmoArtsStore\\STELLARECORD\\setting\\PolarisSetting.json
                         \\CosmoArtsStore\\STELLARECORD\\setting\\PolarisSetting.json        

  polaris_appinfo.log    %LOCALAPPDATA% +                                                    C:\\Users\\kaimu\\AppData\\Local\\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\polaris_appinfo.log
                         \\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\polaris_appinfo.log   

  デフォルト archive_dir %LOCALAPPDATA% +                                                    \...\\app\\Polaris\\archive
                         \\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\archive               

  VRChat                 %APPDATA% + \\..\\LocalLow\\VRChat\\VRChat                          \...\\AppData\\LocalLow\\VRChat\\VRChat
  ログ元ディレクトリ                                                                         

  タスクトレイアイコン   std::env::current_exe().parent().join(\"icon.png\")                 exe と同ディレクトリの icon.png
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

> *📌 ディレクトリが存在しない場合は fs::create_dir_all()
> で自動作成する（設定ディレクトリ・ログディレクトリとも）。*

**1.3 モジュール構成（ソースファイル）**

  ---------------------------------------------------------------------------------------------------------------------------
  **ファイル**      **モジュール**   **責務**
  ----------------- ---------------- ----------------------------------------------------------------------------------------
  src/main.rs       （ルート）       main()・バックアップロジック・マイグレーション・VRChat監視スレッド・タスクトレイループ

  src/config.rs     config           PolarisSetting 構造体の定義・JSON 読み書き・デフォルト値・get_effective_archive_dir()

  src/logger.rs     logger           polaris_appinfo.log の初期化（truncate_log）・書き込み（log_info）

  src/lib.rs        ---              pub mod config; pub mod logger; のエクスポートのみ
  ---------------------------------------------------------------------------------------------------------------------------

**1.4 PolarisSetting 構造体と JSON 仕様**

**1.4.1 フィールド定義**

  -----------------------------------------------------------------------------------------------------------------------
  **フィールド名**         **JSONキー名**           **型**   **デフォルト値**     **説明**
  ------------------------ ------------------------ -------- -------------------- ---------------------------------------
  archivePath              archivePath              String   \"\"（空文字）       archive フォルダのパス。空 =
                                                                                  デフォルトパスを使用

  capacityThresholdBytes   capacityThresholdBytes   u64      10_737_418_240（10   容量警告の閾値（バイト単位）
                                                             GB）                 

  enableStartup            enableStartup            bool     true                 スタートアップ登録の有無（Polaris.exe
                                                                                  自身は使用しない。STELLA_RECORD.exe
                                                                                  がレジストリ制御）

  migrationStatus          migrationStatus          String   \"done\"             \"done\" = 通常状態 / \"in_progress\" =
                                                                                  マイグレーション中

  migrationSourcePath      migrationSourcePath      String   \"\"（空文字）       マイグレーション元パス（in_progress
                                                                                  時のみ使用）
  -----------------------------------------------------------------------------------------------------------------------

**1.4.2 デフォルト値の定義方式**

serde の #\[serde(default)\]
アトリビュートを使用する。各フィールドごとに専用のデフォルト関数を定義し、JSON
にキーが存在しない場合でも安全にデシリアライズされる。

  -------------------------------------------------------------------------------
  **フィールド**           **デフォルト関数**           **返却値**
  ------------------------ ---------------------------- -------------------------
  archivePath              #\[serde(default)\]          String::new()（String の
                                                        Default）

  capacityThresholdBytes   #\[serde(default =           fn default_capacity() -\>
                           \"default_capacity\")\]      u64 { 10_737_418_240 }

  enableStartup            #\[serde(default =           fn default_true() -\>
                           \"default_true\")\]          bool { true }

  migrationStatus          #\[serde(default =           fn default_done() -\>
                           \"default_done\")\]          String {
                                                        \"done\".to_string() }

  migrationSourcePath      #\[serde(default)\]          String::new()（String の
                                                        Default）
  -------------------------------------------------------------------------------

**1.4.3 load_setting() と load_setting_with_tmp_copy() の違い**

  --------------------------------------------------------------------------------------
  **関数名**                     **使用箇所**       **動作**
  ------------------------------ ------------------ ------------------------------------
  config::load_setting()         フォールバック用   PolarisSetting.json
                                                    を直接読む。デシリアライズ失敗時は
                                                    Default を返す

  load_setting_with_tmp_copy()   main()             STELLA_RECORD.exe
                                 起動時・VRChat     による書き込み競合を避けるために tmp
                                 終了検知時         コピーを経由して読む（後述 §1.4.4）
  --------------------------------------------------------------------------------------

**1.4.4 load_setting_with_tmp_copy() の処理フロー**

  --------------------------------------------------------------------------------------------------------
  **順序**   **処理内容**                                 **失敗時**
  ---------- -------------------------------------------- ------------------------------------------------
  ①          get_setting_path() で PolarisSetting.json    config::load_setting() にフォールバック
             のフルパスを取得                             

  ②          path.with_extension(\"json.tmp\") で tmp     ---
             パスを生成（例: PolarisSetting.json.tmp）    

  ③          fs::copy(&path, &tmp_path) でコピーを作成    config::load_setting() にフォールバック

  ④          fs::read_to_string(&tmp_path) →              tmp 削除後 config::load_setting()
             serde_json::from_str                         にフォールバック
             で構造体にデシリアライズ                     

  ⑤          fs::remove_file(&tmp_path) で tmp            削除失敗はログ出力なし・起動続行（次回上書き）
             ファイルを削除                               

  ⑥          デシリアライズ成功した PolarisSetting を返す ---
  --------------------------------------------------------------------------------------------------------

> *⚠ tmp ファイルのパスは PolarisSetting.json と同ディレクトリの
> PolarisSetting.json.tmp である。設計書旧版の
> polaris_setting_tmp.json（別ディレクトリ）ではない。*

**1.4.5 get_effective_archive_dir() によるデフォルトパスの決定**

archivePath フィールドが空文字列の場合のみ、以下のデフォルト archive_dir
を返す。

> **%LOCALAPPDATA%\\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\archive**

この関数は config.rs の PolarisSetting
メソッドとして定義されており、Polaris.exe が archive_dir
を参照するすべての箇所で呼び出す。

**1.5 polaris_appinfo.log 仕様（logger モジュール）**

**1.5.1 ファイルパスと初期化**

  --------------------------------------------------------------------------------------------------------
  **項目**               **内容**
  ---------------------- ---------------------------------------------------------------------------------
  ファイルパス           %LOCALAPPDATA%\\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\polaris_appinfo.log

  ディレクトリ自動作成   get_log_path() 内で create_dir_all()
                         を呼び、ディレクトリが存在しない場合は作成する

  起動時初期化           truncate_log() を main()
                         の最初に呼ぶ。OpenOptions::write(true).truncate(true).create(true)
                         で開く（前回ログを全消去）

  書き込み関数           log_info(module: &str, message: &str) を使用
  --------------------------------------------------------------------------------------------------------

**1.5.2 ログ出力フォーマット**

出力フォーマットは以下の固定形式。module フィールドを持つ。

> **\[YYYY-MM-DD HH:MM:SS\] \[モジュール名\] メッセージ\\n**

例: \[2024-01-15 22:30:45\] \[Polaris\] 起動しました

**1.5.3 ファイル共有モード（Windows）**

log_info() 内でのファイルオープンは Windows API の ShareMode
を使用する。STELLA_RECORD.exe が読み取りと同時に Polaris.exe
が書き込むことができるよう、FILE_SHARE_READ \| FILE_SHARE_WRITE \|
FILE_SHARE_DELETE の3フラグすべてを設定する。

  ---------------------------------------------------------------------------------
  **共有フラグ**          **許可する操作**
  ----------------------- ---------------------------------------------------------
  FILE_SHARE_READ         他プロセスが同時に読み取ることを許可（STELLA_RECORD.exe
                          の監視表示用）

  FILE_SHARE_WRITE        他プロセスが同時に書き込むことを許可

  FILE_SHARE_DELETE       他プロセスが削除操作を行うことを許可
  ---------------------------------------------------------------------------------

**1.5.4 ログ出力メッセージ一覧（module = \"Polaris\" 固定）**

  -------------------------------------------------------------------------------------------------------
  **メッセージ**                                                         **出力タイミング**
  ---------------------------------------------------------------------- --------------------------------
  起動しました                                                           main() 開始直後（truncate_log
                                                                         後）

  起動時バックアップ完了: N件                                            起動時 backup_logs() 完了後

  移行処理を開始します: {旧パス} -\> {新パス}                            run_migration() 開始時

  フォルダ内全ファイルのコピーに成功しました。元フォルダを削除します。   ディレクトリコピー全成功時

  移行処理が完了しました。                                               run_migration() 成功完了時

  移行処理中にエラーが発生しました。次回起動時に再試行します。           run_migration() エラー発生時

  Zip展開失敗: {エラー}                                                  extract_zip_to_dir() 失敗時

  ファイルコピー失敗 ({ファイル名}): {エラー}                            個別ファイルコピー失敗時

  移行失敗 (dest取得エラー): {エラー}                                    archive_dir 取得失敗時

  移行元が見通せません（ファイルでもディレクトリでもない）               移行元が不正な場合

  VRChat 起動検知                                                        監視ループ：起動フラグ立てた時

  VRChat 終了検知。バックアップを開始します。                            監視ループ：終了フラグ検知時

  終了時バックアップ完了: N件                                            VRChat 終了後 backup_logs()
                                                                         完了時

  \[WARNING\] archiveが容量警告閾値を超過しています: X.XX GB / Y.YY GB   check_capacity() で超過検知時

  正常終了                                                               タスクトレイ「終了」選択時
  -------------------------------------------------------------------------------------------------------

**1.6 main() の初期化順序**

  ------------------------------------------------------------------------------------------------
  **順序**   **処理内容**                                         **備考**
  ---------- ---------------------------------------------------- --------------------------------
  ①          truncate_log()                                       logger モジュール
             でログファイルを初期化（前回ログ消去）               

  ②          log_info(\"Polaris\", \"起動しました\") を出力       ---

  ③          load_setting_with_tmp_copy() で PolarisSetting       失敗時はデフォルト設定で続行
             を読み込む → setting: PolarisSetting                 

  ④          run_migration(&mut setting) を実行（migrationStatus  移行失敗は次回起動時に再試行
             が \"in_progress\" なら移行処理）                    

  ⑤          backup_logs(&setting) を実行 → count: usize を取得   起動時バックアップ

  ⑥          log_info(\"Polaris\", \"起動時バックアップ完了:      ---
             N件\")                                               

  ⑦          check_capacity(&setting) を実行                      閾値超過なら WARNING ログ出力

  ⑧          register_application_restart() を呼び出す            60秒タイマーなし。即時呼び出し

  ⑨          Arc\<Mutex\<PolarisSetting\>\> に setting            VRChat
             をラップし、setting_arc を作成                       監視スレッドと共有するため

  ⑩          thread::spawn で VRChat 監視スレッドを起動           別スレッドで 5 秒ポーリング

  ⑪          run_tray_loop()                                      終了まで main
             でタスクトレイのイベントループ開始（ブロッキング）   スレッドはここで待機
  ------------------------------------------------------------------------------------------------

> *⚠ RegisterApplicationRestart は 60
> 秒タイマーなしで起動直後に呼び出す。設計書旧版の「60
> 秒後に発火」は実装されていない。*

**1.7 RegisterApplicationRestart の実装**

  --------------------------------------------------------------------------------------
  **項目**                       **内容**
  ------------------------------ -------------------------------------------------------
  呼び出し API                   winapi::um::winbase::RegisterApplicationRestart

  引数 lpCommandLine             空文字列（\"\"）の WCHAR
                                 文字列。OsStr::new(\"\").encode_wide().chain(once(0))
                                 で生成

  引数 dwFlags                   0

  呼び出しタイミング             main() のステップ⑧（backup_logs・check_capacity
                                 完了後、VRChat 監視スレッド起動前）

  UnregisterApplicationRestart   タスクトレイ終了時には UnregisterApplicationRestart
                                 を呼ばない（実装なし）

  クラッシュ時の挙動             OS が自動的に Polaris.exe を再起動する
  --------------------------------------------------------------------------------------

**1.8 マイグレーション処理（run_migration）**

PolarisSetting.json の migrationStatus が \"in_progress\" かつ
migrationSourcePath
が空でない場合のみ実行する。移行元（source）のタイプによって処理が分岐する。

**1.8.1 処理の入口条件**

  -------------------------------------------------------------------------
  **条件**               **処理**
  ---------------------- --------------------------------------------------
  migrationStatus !=     即座に return（何もしない）
  \"in_progress\" または 
  migrationSourcePath    
  が空                   

  両方とも条件を満たす   マイグレーション処理を実行
  -------------------------------------------------------------------------

**1.8.2 移行元タイプ別フロー**

  ------------------------------------------------------------------------------------------------------------------------
  **移行元の状態**                              **使用関数**                                  **処理内容**
  --------------------------------------------- --------------------------------------------- ----------------------------
  src が .zip ファイル（旧 LogBackupTool        extract_zip_to_dir(src, &dest)                ZIP アーカイブを展開して
  からの移行）                                                                                dest_dir
                                                                                              へファイルを配置する（後述
                                                                                              §1.8.3）

  src                                           WalkDir::new(src).min_depth(1).max_depth(1)   src 直下のファイルのみ（1
  がディレクトリ（archiveパス変更による移動）   でループ                                      階層）を dest
                                                                                              へコピー。全コピー成功後に
                                                                                              src を remove_dir_all で削除

  src が存在しない / 上記以外                   ログ出力のみ                                  \"移行元が見通せません\"
                                                                                              をログ出力して success =
                                                                                              false
  ------------------------------------------------------------------------------------------------------------------------

**1.8.3 extract_zip_to_dir の動作**

  ------------------------------------------------------------------------------
  **順序**   **処理内容**
  ---------- -------------------------------------------------------------------
  ①          ZIP ファイルを File::open して ZipArchive::new(file) を生成

  ②          archive.len() のエントリ数分ループ（archive.by_index(i)）

  ③          entry.enclosed_name()
             でエントリ名を取得し、dest_dir.join(path.file_name())
             で出力先パスを構築

  ④          エントリがディレクトリの場合（名前が \'/\' で終わる）:
             create_dir_all で作成

  ⑤          エントリがファイルの場合: 親ディレクトリを create_dir_all で確保 →
             File::create → io::copy でバイト列を書き出す
  ------------------------------------------------------------------------------

**1.8.4 マイグレーション成功・失敗後の処理**

  --------------------------------------------------------------------------------
  **結果**        **処理**
  --------------- ----------------------------------------------------------------
  成功（success   setting.migrationStatus = \"done\"、setting.migrationSourcePath
  == true）       = \"\" に更新して save_setting(&setting)
                  を呼び出す。\"移行処理が完了しました\" をログ出力

  失敗（success   \"移行処理中にエラーが発生しました。次回起動時に再試行します\"
  == false）      をログ出力。PolarisSetting.json の migrationStatus
                  は変更しない（次回起動時に再実行される）
  --------------------------------------------------------------------------------

> *⚠ ディレクトリ移動の場合、コピー成功確認後に remove_dir_all(src)
> を実行する。個別ファイルコピーが 1 件でも失敗した場合は success =
> false のままループを break し、src は削除しない。*

**1.9 バックアップ処理（backup_logs）**

**1.9.1 変数定義**

  ------------------------------------------------------------------------------------------------
  **変数名**      **型**      **初期値**                                **用途**
  --------------- ----------- ----------------------------------------- --------------------------
  appdata         String      %APPDATA% 環境変数                        src_dir の基点

  src_dir         PathBuf     %APPDATA%\\..\\LocalLow\\VRChat\\VRChat   VRChat
                                                                        ログの出力先ディレクトリ

  dest_dir        PathBuf     get_effective_archive_dir() の結果        コピー先の archive
                                                                        ディレクトリ

  count           usize       0                                         コピー成功件数（返却値）
  ------------------------------------------------------------------------------------------------

**1.9.2 バックアップ実行フロー**

  ------------------------------------------------------------------------------------------------------------
  **順序**                     **処理内容**                             **失敗時**
  ---------------------------- ---------------------------------------- --------------------------------------
  ①                            %APPDATA% 環境変数を取得 → src_dir       Err なら 0 を返して終了
                               を構築                                   

  ②                            get_effective_archive_dir() で dest_dir  Err なら 0 を返して終了
                               を取得                                   

  ③                            dest_dir が存在しない場合は              失敗してもコピー試行を続ける
                               create_dir_all で作成                    

  ④                            src_dir の全エントリを fs::read_dir      read_dir 失敗なら 0 を返して終了
                               で走査                                   

  ⑤ フィルタ                   ファイル名が output_log\_ で始まり .txt  ---
                               で終わるものに限定                       

  ⑥ 重複ガード                 dest_path（= dest_dir /                  ---
                               ファイル名）が存在しない → need_copy =   
                               true                                     

  ⑦ 重複ガード（更新日時比較） dest_path が存在する場合: src.modified() metadata / modified() 取得失敗 →
                               \> dest.modified() なら need_copy =      need_copy = false（スキップ）
                               true（src のほうが新しい場合のみ上書き） 

  ⑧ コピー実行                 need_copy == true のとき                 コピー失敗はスキップ（ログ出力なし）
                               fs::copy(src_path, dest_path) を実行 →   
                               成功なら count++                         

  ⑨                            count を返す                             ---
  ------------------------------------------------------------------------------------------------------------

> *⚠
> 更新日時比較による重複ガードが実装されている。単純なファイル名存在チェックだけでなく、src
> が dest より新しい場合は上書きコピーする。*

**1.9.3 バックアップ実行タイミング一覧**

  ---------------------------------------------------------------------------------
  **タイミング**       **実行箇所**                  **設定の再ロード**
  -------------------- ----------------------------- ------------------------------
  起動時バックアップ   main() ステップ⑤              load_setting_with_tmp_copy()
                                                     済みの setting を使用

  VRChat               VRChat                        load_setting_with_tmp_copy()
  終了時バックアップ   監視スレッド内（!vrchat_now   を再度呼んで最新設定を取得
                       && vrchat_was_running 時）    

  手動バックアップ     STELLA_RECORD.exe が          ---（STELLA_RECORD.exe
                       backup_logs() を直接呼ぶ      側が条件確認）
  ---------------------------------------------------------------------------------

> *📌 VRChat 終了検知時は load_setting_with_tmp_copy()
> を再実行して最新の設定（archivePath
> 等）を取得してからバックアップする。監視スレッド起動時のスナップショットではなく、その時点の最新設定を反映する。*

**1.10 容量監視（check_capacity）**

  -----------------------------------------------------------------------
  **項目**             **内容**
  -------------------- --------------------------------------------------
  走査方法             WalkDir::new(&archive_dir) で archive_dir
                       を再帰走査（zip/
                       サブディレクトリを含む全ファイルが対象）

  サイズ集計           entry.metadata().map(\|m\| m.len()).unwrap_or(0)
                       でファイルサイズを加算

  比較                 total \>= setting.capacityThresholdBytes

  超過時のログ出力     \"\[WARNING\]
                       archiveが容量警告閾値を超過しています: {:.2} GB /
                       {:.2} GB\" を log_info で出力

  未超過時             何も出力しない

  呼び出しタイミング   起動時バックアップ完了後（main ステップ⑦）・VRChat
                       終了時バックアップ完了後（監視スレッド内）
  -----------------------------------------------------------------------

**1.11 VRChat プロセス監視ループ（別スレッド）**

**1.11.1 スレッド内の変数定義**

  ---------------------------------------------------------------------------------------
  **変数名**           **型**            **初期値**      **用途**
  -------------------- ----------------- --------------- --------------------------------
  vrchat_was_running   bool              false           前回ポーリング時に VRChat
                                                         が起動中だったかどうか

  sys                  sysinfo::System   System::new()   プロセス情報取得用（毎ループで
                                                         refresh_processes を呼ぶ）
  ---------------------------------------------------------------------------------------

**1.11.2 ループの構造と状態遷移**

ループの先頭で thread::sleep(Duration::from_secs(5))
を実行してから処理を行う（末尾 sleep ではない）。

  ---------------------------------------------------------------------------------------------------
  **vrchat_now**   **vrchat_was_running**   **状態**             **処理**
  ---------------- ------------------------ -------------------- ------------------------------------
  true             false                    VRChat 起動検知      log_info(\"VRChat 起動検知\") →
                                                                 vrchat_was_running = true

  false            true                     VRChat 終了検知      log_info(\"VRChat 終了検知\...\"） →
                                                                 load_setting_with_tmp_copy()
                                                                 で設定再ロード → setting_arc を更新
                                                                 → backup_logs() →
                                                                 log_info(\"終了時バックアップ完了:
                                                                 N件\") → check_capacity() →
                                                                 vrchat_was_running = false

  true             true                     起動中（変化なし）   何もしない

  false            false                    未起動（変化なし）   何もしない
  ---------------------------------------------------------------------------------------------------

**1.11.3 プロセス検出方法**

sys.refresh_processes(ProcessesToUpdate::All, true)
でプロセスリストを更新後、sys.processes().values().any(\|p\| {
p.name().to_string_lossy().to_lowercase() == \"vrchat.exe\" \|\|
p.name().to_string_lossy().to_lowercase() == \"vrchat\" }) で VRChat
の存在を確認する。大文字小文字を to_lowercase() で統一して比較する。

**1.12 タスクトレイ実装（run_tray_loop）**

  ---------------------------------------------------------------------------------------------------------
  **項目**               **内容**
  ---------------------- ----------------------------------------------------------------------------------
  使用クレート           tray-icon（TrayIconBuilder・Menu・MenuItem・MenuEvent）、tao（EventLoopBuilder）

  イベントループ         tao の EventLoopBuilder::new().build() で EventLoop を作成し
                         event_loop.run(closure) で開始

  ControlFlow            ControlFlow::Wait（イベントなしは待機）。終了時は ControlFlow::Exit

  メニュー               MenuItem::new(\"終了\", true, None) の1項目のみ

  メニューイベント検知   MenuEvent::receiver() でチャンネルを取得し、イベントループの closure 内で
                         menu_channel.try_recv() を呼んで受け取る

  終了処理               menu_event.id == quit_id の場合: log_info(\"Polaris\", \"正常終了\") を出力して
                         \*control_flow = ControlFlow::Exit（UnregisterApplicationRestart は呼ばない）
  ---------------------------------------------------------------------------------------------------------

**1.12.1 タスクトレイアイコンの読み込み**

  --------------------------------------------------------------------------------------------------
  **処理**                       **内容**
  ------------------------------ -------------------------------------------------------------------
  アイコンファイルパス           std::env::current_exe().parent().unwrap().join(\"icon.png\")（exe
                                 と同ディレクトリ）

  ファイル形式                   .png（.ico ではない）

  読み込みクレート               image クレートの image::open()。into_rgba8().into_raw() で RGBA
                                 バイト列を取得

  tray_icon::Icon 生成           tray_icon::Icon::from_rgba(rgba_bytes, width, height)

  アイコン不在・読み込み失敗時   tray_icon::Icon::from_rgba(vec\![0; 4\], 1, 1)
                                 の透明アイコンを使用（パニックしない）

  ツールチップ                   \"Polaris - StellaRecord\"
  --------------------------------------------------------------------------------------------------

**1.13 エラー処理方針**

  -----------------------------------------------------------------------------------
  **エラー種別**             **処理方針**
  -------------------------- --------------------------------------------------------
  %LOCALAPPDATA%             backup_logs / check_capacity / get_setting_path は即 Err
  環境変数取得失敗           または 0 を返して呼び出し元に任せる。ログ出力も行わない

  PolarisSetting.json        Default 値で続行。特にログ出力なし
  読み込み失敗               

  archive_dir 作成失敗       let \_ = fs::create_dir_all()
                             で無視（次のコピーで失敗したとき自然にスキップされる）

  個別ファイルのコピー失敗   count を増やさずスキップ。ログ出力なし

  マイグレーション失敗       \"移行処理中にエラーが発生しました\"
                             をログ出力。次回起動時に再試行

  タスクトレイビルド失敗     .expect(\"Failed to create tray icon\") でパニック
  -----------------------------------------------------------------------------------

**1.14 起動〜常駐〜終了 シーケンス概要**

  ----------------------------------------------------------------------------
  **フェーズ**           **処理内容**
  ---------------------- -----------------------------------------------------
  main() 開始            truncate_log → ログ出力「起動しました」

  設定読み込み           load_setting_with_tmp_copy() → 設定ファイルを tmp
                         経由で読み込み

  マイグレーション       run_migration(&mut setting)（in_progress なら ZIP
                         展開またはディレクトリコピー）

  起動時バックアップ     backup_logs(&setting) → check_capacity(&setting)

  再起動予約             register_application_restart()（即時呼び出し）

  監視スレッド起動       thread::spawn で VRChat 監視ループ（5 秒ポーリング）

  常駐                   run_tray_loop()（tao のイベントループでブロック）

  VRChat 起動検知        監視スレッド: vrchat_was_running = true

  VRChat 終了検知        監視スレッド: 設定再ロード → backup_logs →
                         check_capacity

  タスクトレイ終了選択   MenuEvent 受信 → ControlFlow::Exit → プロセス終了
  ----------------------------------------------------------------------------

**2. Planetarium.exe 詳細設計書**

DB 構築エンジン --- ログパース・DB 登録・アーカイブ圧縮

**2.1 概要**

  -----------------------------------------------------------------------------------------------
  **項目**             **内容**
  -------------------- --------------------------------------------------------------------------
  役割                 archive/ 配下の raw ログファイルをパースして planetarium.db
                       に差分登録し、処理済みファイルを tar.zst 化してアーカイブする

  実装言語             Rust（edition = 2024）

  バージョン           0.1.0

  常駐性               処理完了後に自動終了（常駐しない）

  DB 権限              planetarium.db への Read/Write（他モジュールはすべて Read-Only）

  主要クレート         rusqlite、zstd（0.13.3）、tar（0.4.44）、regex、chrono、once_cell、serde /
                       serde_json、winapi

  起動モード           引数なし = 通常モード / \--force-sync = 強制 Sync モード

  完了通知方式         stdout への println!（JSON ではなくプレーンテキスト）
  -----------------------------------------------------------------------------------------------

**2.2 パス解決の方式**

Planetarium.exe もすべてのパスを %LOCALAPPDATA%
環境変数を起点に解決する（install_dir 相対パスは使用しない）。

  ------------------------------------------------------------------------------------------------------------------------------------------
  **対象**                       **解決方法**                                                       **デフォルトパス**
  ------------------------------ ------------------------------------------------------------------ ----------------------------------------
  PlanetariumSetting.json        %LOCALAPPDATA% +                                                   ---（固定パス）
                                 \\CosmoArtsStore\\STELLARECORD\\setting\\PlanetariumSetting.json   

  archive_dir（デフォルト）      archivePath が空の場合: %LOCALAPPDATA% +                           \...\\app\\Polaris\\archive
                                 \\CosmoArtsStore\\STELLARECORD\\app\\Polaris\\archive              

  planetarium.db（デフォルト）   dbPath が空の場合: %LOCALAPPDATA% +                                \...\\app\\Planetarium\\planetarium.db
                                 \\CosmoArtsStore\\STELLARECORD\\app\\Planetarium\\planetarium.db   

  zip_dir（tar.zst 保存先）      get_effective_archive_dir() + \\zip                                \...\\app\\Polaris\\archive\\zip
  ------------------------------------------------------------------------------------------------------------------------------------------

> *📌 dbPath が示すディレクトリが存在しない場合、get_effective_db_path()
> 内で create_dir_all() を呼んで自動作成する。*

**2.3 PlanetariumSetting 構造体と JSON 仕様**

  -----------------------------------------------------------------------------------------------
  **フィールド名**     **JSONキー名**       **型**   **デフォルト値**   **説明**
  -------------------- -------------------- -------- ------------------ -------------------------
  archivePath          archivePath          String   \"\"（空文字）     archive
                                                                        フォルダのパス。空 =
                                                                        デフォルトパス

  dbPath               dbPath               String   \"\"（空文字）     planetarium.db
                                                                        の保管パス。空 =
                                                                        デフォルトパス

  enableUserTracking   enableUserTracking   bool     false              Privacy / Tracking
                                                                        モードの切り替え。false =
                                                                        Privacy
                                                                        モード（デフォルト）
  -----------------------------------------------------------------------------------------------

load_setting() は get_setting_path() で JSON
パスを取得し、読み込み・デシリアライズに失敗した場合は
PlanetariumSetting::default() を返す。tmp コピー機構は Planetarium.exe
には実装されていない（直接読み込み）。

**2.4 main() の処理フロー**

  --------------------------------------------------------------------------------------------------------------------
  **順序**   **処理内容**                                 **失敗時**
  ---------- -------------------------------------------- ------------------------------------------------------------
  ①          load_setting() で PlanetariumSetting         デフォルト設定で続行
             を読み込む                                   

  ②          setting.get_effective_db_path() で DB        unwrap_or_else で
             パスを解決                                   \"planetarium.db\"（カレントディレクトリ）にフォールバック

  ③          setting.enableUserTracking を tracking       ---
             変数に格納                                   

  ④          println! で DB パスと tracking               ---
             モードをログ出力（stdout）                   

  ⑤          Connection::open(&db_path) で SQLite         ? で Result を伝搬。失敗なら exit
             接続を開く                                   

  ⑥          PRAGMA journal_mode = WAL; を実行            ---

  ⑦          SCHEMA 定数の CREATE TABLE IF NOT EXISTS     ---
             文を一括実行（execute_batch）                

  ⑧          std::env::args() で \--force-sync 引数を確認 ---

  ⑨          \--force-sync あり: run_force_sync(&mut      ---
             conn, &setting, tracking)                    

  ⑩          \--force-sync なし: run_normal_mode(&mut     ---
             conn, &setting, tracking)                    

  ⑪          println!(\"\[Planetarium\] 処理完了\")       ---
  --------------------------------------------------------------------------------------------------------------------

> *⚠ PRAGMA foreign_keys = ON は実装されていない。SCHEMA の FOREIGN KEY
> 定義は存在するが整合性チェックの PRAGMA は発行しない。*

**2.5 DB スキーマ（SCHEMA 定数）**

以下の 6 テーブルを CREATE TABLE IF NOT EXISTS で一括作成する（SCHEMA
定数として定義済み）。WAL モード設定後に execute_batch(SCHEMA)
で実行する。

**2.5.1 app_sessions**

  -----------------------------------------------------------------------------------------
  **カラム名**      **型・制約**         **説明**
  ----------------- -------------------- --------------------------------------------------
  id                INTEGER PRIMARY KEY  セッション ID
                    AUTOINCREMENT        

  start_time        DATETIME NOT NULL    セッション開始時刻（最初のタイムスタンプ）

  end_time          DATETIME             セッション終了時刻（最後のタイムスタンプ）

  my_user_id        TEXT                 自分の usr_ID（Privacy モードでは NULL）

  my_display_name   TEXT                 自分の表示名（Privacy モードでは NULL、Tracking
                                         モードでは実名）

  vrchat_build      TEXT                 VRChat ビルドバージョン文字列

  log_filename      TEXT UNIQUE NOT NULL 処理済みログファイル名（重複インポート防止キー）
  -----------------------------------------------------------------------------------------

**2.5.2 world_visits**

  -------------------------------------------------------------------------
  **カラム名**      **型・制約**          **説明**
  ----------------- --------------------- ---------------------------------
  id                INTEGER PRIMARY KEY   ---
                    AUTOINCREMENT         

  session_id        INTEGER NOT NULL,     所属セッション
                    FK→app_sessions(id)   

  world_name        TEXT NOT NULL         ワールド表示名

  world_id          TEXT NOT NULL         wrld_xxx 形式 ID

  instance_id       TEXT NOT NULL         フルインスタンス
                                          ID（world_id:access_raw 形式）

  access_type       TEXT                  public / friends / private /
                                          hidden / group

  instance_owner    TEXT                  インスタンスオーナーの
                                          usr_ID（Privacy モードでは NULL）

  region            TEXT                  jp / us / eu / use 等

  join_time         DATETIME NOT NULL     入室日時

  leave_time        DATETIME              退室日時（NULL =
                                          クラッシュ等で記録なし）
  -------------------------------------------------------------------------

**2.5.3 players**

  ------------------------------------------------------------------------
  **カラム名**      **型・制約**         **説明**
  ----------------- -------------------- ---------------------------------
  id                INTEGER PRIMARY KEY  ---
                    AUTOINCREMENT        

  user_id           TEXT UNIQUE          usr_ID（Privacy モードでは
                                         NULL。UNIQUE 制約は NULL
                                         に対しては適用されない）

  display_name      TEXT NOT NULL        プレイヤー表示名（Privacy
                                         モードでは \"\[User_Masked\]\"
                                         または \"\[LocalPlayer\]\"）
  ------------------------------------------------------------------------

**2.5.4 player_visits**

  --------------------------------------------------------------------------------
  **カラム名**      **型・制約**          **説明**
  ----------------- --------------------- ----------------------------------------
  id                INTEGER PRIMARY KEY   ---
                    AUTOINCREMENT         

  visit_id          INTEGER NOT NULL,     紐づくワールド訪問
                    FK→world_visits(id)   

  player_id         INTEGER NOT NULL,     紐づくプレイヤー
                    FK→players(id)        

  is_local          BOOLEAN NOT NULL      自分自身（ローカルプレイヤー）かどうか
                    DEFAULT 0             

  join_time         DATETIME NOT NULL     プレイヤー参加日時

  leave_time        DATETIME              プレイヤー退出日時
  --------------------------------------------------------------------------------

**2.5.5 avatar_changes**

  --------------------------------------------------------------------------
  **カラム名**       **型・制約**          **説明**
  ------------------ --------------------- ---------------------------------
  id                 INTEGER PRIMARY KEY   ---
                     AUTOINCREMENT         

  visit_id           INTEGER NOT NULL,     紐づくワールド訪問
                     FK→world_visits(id)   

  player_id          INTEGER,              紐づくプレイヤー（LOOKUP 失敗時は
                     FK→players(id)        NULL）

  display_name_raw   TEXT NOT NULL         マスク後の表示名（Privacy:
                                           \"\[User_Masked\]\" /
                                           \"\[LocalPlayer\]\"）

  avatar_name        TEXT NOT NULL         アバター名称

  timestamp          DATETIME NOT NULL     変更日時
  --------------------------------------------------------------------------

**2.5.6 video_playbacks**

  --------------------------------------------------------------------------
  **カラム名**       **型・制約**          **説明**
  ------------------ --------------------- ---------------------------------
  id                 INTEGER PRIMARY KEY   ---
                     AUTOINCREMENT         

  visit_id           INTEGER NOT NULL,     紐づくワールド訪問
                     FK→world_visits(id)   

  player_id          INTEGER,              リクエスト者（LOOKUP 失敗時は
                     FK→players(id)        NULL）

  display_name_raw   TEXT                  マスク後の表示名（NULL
                                           の場合あり）

  url                TEXT NOT NULL         再生された URL

  timestamp          DATETIME NOT NULL     再生開始日時
  --------------------------------------------------------------------------

**2.6 正規表現定義（static Lazy\<Regex\>）**

once_cell::sync::Lazy を使用して正規表現をプロセス起動時に 1
回だけコンパイルし、全ファイル処理で再利用する。

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **変数名**        **正規表現パターン**                                                                                                  **用途**
  ----------------- --------------------------------------------------------------------------------------------------------------------- --------------------------------------
  RE_TIME           \^(\\d{4}\\.\\d{2}\\.\\d{2} \\d{2}:\\d{2}:\\d{2})                                                                     タイムスタンプ抽出（全行に適用）

  RE_USER_AUTH      User Authenticated: (.\*?) \\((usr\_.\*?)\\)                                                                          ユーザー認証行

  RE_BUILD          VRChat Build: (.\*)                                                                                                   ビルドバージョン行

  RE_ENTERING       \\\[Behaviour\\\] Entering Room: (.\*)                                                                                ワールド入室（名前）

  RE_JOINING        \\\[Behaviour\\\] Joining                                                                                             ワールド入室（ID・インスタンス情報）
                    (wrld\_\[\^:\]+)(?::(\\d+))?\~?((?:private\|friends\|hidden\|public\|group)\[\^\~\]\*)(?:\~region\\((\[\^)\]+)\\))?   

  RE_LEFT_ROOM      \\\[Behaviour\\\] OnLeftRoom                                                                                          ワールド退室

  RE_PLAYER_JOIN    \\\[Behaviour\\\] OnPlayerJoined (.\*?) \\((usr\_.\*?)\\)                                                             プレイヤー参加

  RE_PLAYER_LEFT    \\\[Behaviour\\\] OnPlayerLeft (.\*?) \\((usr\_.\*?)\\)                                                               プレイヤー退出

  RE_IS_LOCAL       \\\[Behaviour\\\] Initialized PlayerAPI \"(.\*?)\" is (local\|remote)                                                 is_local 判定

  RE_AVATAR         \\\[Behaviour\\\] Switching (.\*?) to avatar (.\*)                                                                    アバター変更

  RE_VIDEO          \\\[(?:\<\[\^\>\]+\>)?USharpVideo(?:\</\[\^\>\]+\>)?\\\] Started video load for URL: (.\*?), requested by (.\*)       動画再生（詳細）。Rich Text タグに対応

  RE_VIDEO_ALT      \\\[(?:\<\[\^\>\]+\>)?USharpVideo(?:\</\[\^\>\]+\>)?\\\] Started video: (.\*)                                         動画再生（簡易）。Rich Text タグに対応

  RE_USR            \\((usr\_\[\^)\]+)\\)                                                                                                 access_raw から instance_owner
                                                                                                                                          を抽出（parse_access_type 内で使用）
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**2.7 通常モード（run_normal_mode）**

**2.7.1 処理フロー**

  ---------------------------------------------------------------------------------------------------------
  **順序**                  **処理内容**                               **失敗時**
  ------------------------- ------------------------------------------ ------------------------------------
  ①                         get_effective_archive_dir() で archive_dir Err → eprintln して Ok(()) で終了
                            を取得                                     

  ②                         collect_log_files(&archive_dir) で         空なら \"処理対象ログなし\"
                            archive_dir 直下の output_log\_\*.txt      を出力して終了
                            を全件収集（ファイル名昇順ソート済み）     

  ③                         ログ件数を                                 ---
                            println!（\"N件のログを処理します\"）      

  ④ ループ（1ファイルずつ） 各 log_path                                ---
                            に対して差分判定→パース→圧縮を実行         

  ④-a 差分判定              SELECT EXISTS(SELECT 1 FROM app_sessions   DB エラー → unwrap_or(false)
                            WHERE log_filename = ?1)                   で未処理として続行
                            で処理済みを判定。true なら                
                            \"スキップ（処理済み）\" を出力して次へ    

  ④-b パース・DB 登録       parse_and_import(conn, log_path,           Err → eprintln してスキップ（tar.zst
                            &filename, tracking) を実行                化しない）

  ④-c tar.zst 化            parse_and_import 成功後:                   Err → eprintln
                            chrono::Local::now() で current_time       のみ。処理は続行（次のファイルへ）
                            を生成 → compress_to_tar_zst(log_path,     
                            &archive_dir, &current_time) を実行        
  ---------------------------------------------------------------------------------------------------------

**2.7.2 collect_log_files の動作**

  -------------------------------------------------------------------------------
  **項目**             **内容**
  -------------------- ----------------------------------------------------------
  走査範囲             archive_dir
                       の直下のみ（サブディレクトリは走査しない）。fs::read_dir
                       で 1 階層のみ

  対象ファイル条件     name.starts_with(\"output_log\_\") かつ
                       name.ends_with(\".txt\")

  ソート               files.sort() でファイルパスの昇順ソート（= ファイル名昇順
                       = 日時昇順）

  archive_dir 不在時   空 Vec を返す（エラーは発生させない）
  -------------------------------------------------------------------------------

**2.8 parse_and_import --- ログパースと DB 登録の全ロジック**

1 つのログファイルを受け取り、全行をパースして planetarium.db
の各テーブルに登録する。処理はすべて 1
つのトランザクション内で行われる。

**2.8.1 ファイルのオープン方式**

  ------------------------------------------------------------------------------
  **プラットフォーム**   **オープン方式**
  ---------------------- -------------------------------------------------------
  Windows                OpenOptionsExt + FILE_SHARE_READ のみを share_mode
                         に設定して読み取り専用で開く（VRChat
                         がファイルに書き込んでいる場合でも読み取り可能）

  非 Windows             File::open() で通常オープン
  ------------------------------------------------------------------------------

**2.8.2 ローカル変数の初期化**

  -----------------------------------------------------------------------------------------------------
  **変数名**          **型**                    **初期値**   **用途**
  ------------------- ------------------------- ------------ ------------------------------------------
  start_time          Option\<String\>          None         最初のタイムスタンプを記録

  end_time            Option\<String\>          None         最後のタイムスタンプを記録（毎行上書き）

  my_user_id          Option\<String\>          None         自分の usr_ID（Tracking モード時のみ設定）

  my_display_name     Option\<String\>          None         自分の表示名（Privacy:
                                                             \"\[LocalPlayer\]\"、Tracking: 実名）

  vrchat_build        Option\<String\>          None         VRChat ビルドバージョン

  current_ts          Option\<NaiveDateTime\>   None         直前にパースした NaiveDateTime

  current_visit_id    Option\<i64\>             None         現在処理中の world_visits.id

  pending_room_name   Option\<String\>          None         Entering Room
                                                             でキャプチャしたワールド名（Joining
                                                             行が来るまで保持）

  line_count          usize                     0            パース済み行数（1000 行ごとに STATUS を
                                                             println!）
  -----------------------------------------------------------------------------------------------------

**2.8.3 ダミー行 INSERT と session_id 取得（パフォーマンス最適化）**

全行をバッファリングせず逐次読み込みを行うため、ファイル走査開始前に
session_id を確定させる必要がある。そのために「空のダミー行」を先に
INSERT して session_id を取得し、最後にファイル末尾で正確な値に UPDATE
する方式を採用する。

  ----------------------------------------------------------------------------------------------------------
  **処理タイミング**   **SQL**                              **備考**
  -------------------- ------------------------------------ ------------------------------------------------
  ファイル走査開始前   INSERT OR IGNORE INTO app_sessions   start_time = \'\' の空文字列でダミー
                       (start_time, end_time, my_user_id,   INSERT。IGNORE により強制 Sync
                       my_display_name, vrchat_build,       時の重複実行を吸収
                       log_filename) VALUES (\'\', NULL,    
                       NULL, NULL, NULL, ?1)                

  session_id 取得      SELECT id FROM app_sessions WHERE    INSERT OR IGNORE の後に SELECT して session_id
                       log_filename = ?1                    を確定

  ファイル走査完了後   UPDATE app_sessions SET start_time = パース後に確定した正確な値で全フィールドを一括
                       ?1, end_time = ?2, my_user_id = ?3,  UPDATE
                       my_display_name = ?4, vrchat_build = 
                       ?5 WHERE log_filename = ?6           
  ----------------------------------------------------------------------------------------------------------

**2.8.4 トランザクションの範囲**

parse_and_import() の開始直後に conn.transaction()
でトランザクションを開始する。ダミー INSERT から最終 UPDATE・COMMIT まで
1 ファイル全体が 1 トランザクションに含まれる。成功時のみ
tx.commit()、エラー時は ? 演算子で Result
を伝搬しトランザクションは自動ロールバックされる。

**2.8.5 進捗表示（標準出力）**

  -----------------------------------------------------------------------
  **タイミング**          **出力内容**
  ----------------------- -----------------------------------------------
  ファイル走査開始時      \[Planetarium\] \[PROGRESS\] 0%

  1000 行処理ごと         \[Planetarium\] \[STATUS\] パース中\... N 行

  ファイル走査完了時      \[Planetarium\] \[PROGRESS\] 100%
  -----------------------------------------------------------------------

> *⚠ 強制 Sync モードを含めて完了通知はすべてプレーンテキストの println!
> である。JSON 形式での出力は実装されていない。STELLA_RECORD.exe
> はこれらの文字列を stdout ポーリングして進捗を把握する。*

**2.9 メインパースループの詳細（状態機械）**

BufReader::lines() で 1
行ずつ逐次読み込み、各行に対して以下の順序でパターンマッチを実行する。マッチした行は
continue で次の行に進む（複数パターンへのマッチは発生しない設計）。

**2.9.1 各パターンの処理詳細**

  -------------------------------------------------------------------------------------------
  **パターン**                       **変数・DB の変化**               **Privacy / Tracking
                                                                       の差異**
  ---------------------------------- --------------------------------- ----------------------
  VRChat Build（RE_BUILD）           vrchat_build =                    なし
                                     Some(キャプチャ①.trim()).         
                                     vrchat_build が None              
                                     の場合のみ設定（最初の 1 回）     

  タイムスタンプ（RE_TIME）          current_ts = Some(パースした      なし
                                     NaiveDateTime). start_time が     
                                     None なら初回値を記録. end_time   
                                     を毎回更新. ts_str = current_ts   
                                     を \"YYYY-MM-DD HH:MM:SS\"        
                                     でフォーマット                    

  User Authenticated（RE_USER_AUTH） Privacy: my_display_name =        表示名がマスクされる /
                                     Some(\"\[LocalPlayer\]\"),        実名を保存
                                     my_user_id = None. Tracking:      
                                     my_display_name = Some(実名),     
                                     my_user_id = Some(usr_xxx).       
                                     my_display_name が None           
                                     の場合のみ設定（最初の 1 回）     

  Entering Room（RE_ENTERING）       current_visit_id が Some の場合:  なし
                                     world_visits と player_visits の  
                                     leave_time を ts_str で           
                                     UPDATE（前のワールドを閉じる）.   
                                     pending_room_name =               
                                     Some(キャプチャ①).                
                                     current_visit_id = None           

  Joining（RE_JOINING）              pending_room_name が Some         instance_owner が NULL
                                     の場合のみ INSERT. world_id =     / usr_ID
                                     キャプチャ①. access_raw =         
                                     キャプチャ③. region =             
                                     キャプチャ④.                      
                                     parse_access_type(access_raw,     
                                     tracking) で access_type と       
                                     instance_owner を取得.            
                                     instance_id = format!(\"{}:{}\",  
                                     world_id, access_raw).            
                                     world_visits に INSERT.           
                                     current_visit_id =                
                                     last_insert_rowid()               

  OnLeftRoom（RE_LEFT_ROOM）         current_visit_id が Some の場合:  なし
                                     world_visits と player_visits の  
                                     leave_time を ts_str で UPDATE.   
                                     current_visit_id = None.          
                                     pending_room_name = None          

  OnPlayerJoined（RE_PLAYER_JOIN）   dname をマスク処理後、players に  dname が
                                     INSERT（後述 §2.9.2）. player_id  \"\[User_Masked\]\" /
                                     を取得して player_visits に       実名
                                     INSERT（join_time = ts_str,       
                                     leave_time = NULL）. is_local     
                                     判定: dname ==                    
                                     \"\[LocalPlayer\]\" \|\|          
                                     line.contains(\"(Local)\") なら   
                                     is_local = 1                      

  OnPlayerLeft（RE_PLAYER_LEFT）     dname をマスク処理後、players     LOOKUP キーが異なる
                                     テーブルから player_id を LOOKUP. 
                                     player_visits の leave_time を    
                                     UPDATE（visit_id + player_id +    
                                     leave_time IS NULL を条件に）     

  Initialized                        locality == \"local\" の場合:     target_dname が異なる
  PlayerAPI（RE_IS_LOCAL）           my_display_name が None または    
                                     \"\[LocalPlayer\]\" なら          
                                     my_display_name =                 
                                     Some(dname_raw). target_dname     
                                     を決定（Privacy:                  
                                     \"\[LocalPlayer\]\"、Tracking:    
                                     dname_raw）. player_visits SET    
                                     is_local = 1 WHERE visit_id =     
                                     current_visit_id AND player_id IN 
                                     (SELECT id FROM players WHERE     
                                     display_name = target_dname)      

  Switching avatar（RE_AVATAR）      dname をマスク処理後、players を  dname が
                                     display_name で LOOKUP →          \"\[User_Masked\]\" /
                                     player_id. avatar_changes に      実名
                                     INSERT（visit_id, player_id,      
                                     display_name_raw=dname,           
                                     avatar_name, timestamp）          

  USharpVideo 詳細（RE_VIDEO）       requester をマスク処理後、players requester が
                                     を display_name で LOOKUP →       \"\[User_Masked\]\" /
                                     player_id. video_playbacks に     実名
                                     INSERT（visit_id, player_id,      
                                     display_name_raw=requester, url,  
                                     timestamp）                       

  USharpVideo 簡易（RE_VIDEO_ALT）   video_playbacks に                なし（差異なし）
                                     INSERT（visit_id, player_id=NULL, 
                                     display_name_raw=NULL, url,       
                                     timestamp）                       
  -------------------------------------------------------------------------------------------

**2.9.2 Privacy モードでのプレイヤー名マスク処理**

Privacy モード（tracking == false）では、他プレイヤーの表示名を NULL
ではなく固定文字列に置換してから DB に保存する。NULL
との違いは「プレイヤーの存在を記録しつつ個人を特定できなくする」点にある。

  ------------------------------------------------------------------------------------------------
  **対象**                         **マスク後の値**              **条件**
  -------------------------------- ----------------------------- ---------------------------------
  自分自身（ローカルプレイヤー）   \"\[LocalPlayer\]\"           my_display_name
                                                                 と一致する、または
                                                                 dname.contains(\"(Local)\")
                                                                 の場合

  他プレイヤー                     \"\[User_Masked\]\"           上記以外のすべてのプレイヤー

  my_display_name が未設定の場合   \"\[User_Masked\]\"（全員）   User Authenticated 行が出現前に
                                                                 OnPlayerJoined
                                                                 が来た場合（稀なケース）
  ------------------------------------------------------------------------------------------------

**2.9.3 players テーブルへの INSERT / UPSERT SQL**

  ------------------------------------------------------------------------------------------------
  **モード**         **SQL**                            **動作**
  ------------------ ---------------------------------- ------------------------------------------
  Privacy            INSERT OR IGNORE INTO players      user_id = NULL で INSERT。同じ表示名でも
  モード（tracking   (user_id, display_name) VALUES     NULL は UNIQUE 制約に該当しないため重複
  == false）         (NULL, ?1)                         INSERT が発生する可能性がある

  Privacy            SELECT id FROM players WHERE       表示名 + user_id IS NULL で最初の 1
  モード（LOOKUP）   display_name = ?1 AND user_id IS   件を取得
                     NULL LIMIT 1                       

  Tracking           INSERT INTO players (user_id,      user_id で UNIQUE
  モード（tracking   display_name) VALUES (?1, ?2) ON   管理。名前変更時も同一ユーザーとして追跡
  == true）          CONFLICT(user_id) DO UPDATE SET    
                     display_name =                     
                     excluded.display_name              

  Tracking           SELECT id FROM players WHERE       user_id でプレイヤーを特定
  モード（LOOKUP）   user_id = ?1                       
  ------------------------------------------------------------------------------------------------

**2.9.4 ログ末尾処理（ファイル走査完了後）**

  -------------------------------------------------------------------------------
  **処理内容**                         **SQL / ロジック**
  ------------------------------------ ------------------------------------------
  オープン中ワールドのクローズ         current_visit_id が Some の場合: UPDATE
                                       world_visits SET leave_time = ?1 WHERE id
                                       = ?2 AND leave_time IS NULL

  オープン中プレイヤー訪問のクローズ   UPDATE player_visits SET leave_time = ?1
                                       WHERE visit_id = ?2 AND leave_time IS NULL

  app_sessions の最終 UPDATE           UPDATE app_sessions SET start_time = ?1,
                                       end_time = ?2, my_user_id = ?3,
                                       my_display_name = ?4, vrchat_build = ?5
                                       WHERE log_filename = ?6

  my_uid_stored の決定                 tracking == true: my_user_id.clone().
                                       tracking == false: None（NULL を保存）
  -------------------------------------------------------------------------------

**2.10 parse_access_type --- アクセス種別とオーナーの分解**

RE_JOINING でキャプチャした access_raw（例: \"friends(usr_abc)\" や
\"public\"）から access_type と instance_owner を取得するヘルパー関数。

  -----------------------------------------------------------------------
  **項目**             **内容**
  -------------------- --------------------------------------------------
  入力                 access_raw: &str（Joining
                       行のキャプチャ③）、tracking: bool

  access_type の抽出   access_raw.to_lowercase()
                       で小文字化し、\"private\" / \"friends\" /
                       \"hidden\" / \"public\" / \"group\" のいずれかで
                       starts_with チェック。一致しない場合は None

  instance_owner       tracking == true:
  の抽出               RE_USR（\\((usr\_\[\^)\]+)\\)）で access_raw
                       を検索し usr_ID を抽出. tracking == false: 常に
                       None

  返却値               (Option\<String\> access_type, Option\<String\>
                       instance_owner) のタプル
  -----------------------------------------------------------------------

**2.11 compress_to_tar_zst --- tar.zst 圧縮処理**

  ---------------------------------------------------------------------------
  **項目**                 **内容**
  ------------------------ --------------------------------------------------
  出力ファイル名           format!(\"{}.tar.zst\",
                           timestamp_str)（timestamp_str = Planetarium.exe
                           起動時刻の YYYYMMDD_HHMMSS）

  出力先                   archive_dir.join(\"zip\").join(name)（zip/
                           ディレクトリ。存在しない場合は create_dir_all
                           で作成）

  圧縮レベル               zstd::stream::Encoder::new(tar_zst_file,
                           1)（レベル 1 = 高速優先）

  アーカイブ内ファイル名   log_path.file_name()
                           のファイル名のみ（フルパスではない）

  tar アーカイブ構築       tar::Builder::new(encoder.auto_finish()) →
                           builder.append_path_with_name(log_path, filename)
                           → builder.into_inner()

  元ファイルの削除         tar.zst 作成処理完了後（into_inner()
                           後）、std::fs::remove_file(log_path)
                           を直接呼ぶ。事前の存在確認なし

  失敗時                   std::io::Error
                           を返す。呼び出し元（run_normal_mode）が eprintln
                           して続行
  ---------------------------------------------------------------------------

> *⚠
> 元ファイルの削除はtar.zst作成の関数（compress_to_tar_zst）内で直接行う。tar.zst
> の存在確認ステップは実装されていない。関数が Ok(())
> を返せば削除まで完了している。*

**2.12 強制 Sync モード（run_force_sync）**

STELLA_RECORD.exe の WARNING エリアから \--force-sync
引数付きで起動される DB 完全再構築処理。archive/zip/ 配下の tar.zst
を全件解凍・再パースして DB を再構築する。

**2.12.1 変数定義**

  ---------------------------------------------------------------------------------------------------------
  **変数名**        **型**           **初期値**                    **用途**
  ----------------- ---------------- ----------------------------- ----------------------------------------
  archive_dir       PathBuf          get_effective_archive_dir()   ベースとなる archive ディレクトリ

  zip_dir           PathBuf          archive_dir.join(\"zip\")     tar.zst ファイルの保存ディレクトリ

  zst_files         Vec\<PathBuf\>   空リスト                      zip_dir 内の \*.tar.zst の全件リスト

  total             usize            zst_files.len()               処理対象の総ファイル数

  tmp_dir           PathBuf          zip_dir.join(\"tmp_sync\")    解凍ファイルを一時展開するディレクトリ
  ---------------------------------------------------------------------------------------------------------

**2.12.2 強制 Sync の処理フロー**

  ---------------------------------------------------------------------------------------------------------------
  **順序**            **処理内容**                                                      **備考**
  ------------------- ----------------------------------------------------------------- -------------------------
  ①                   archive_dir を取得。zip_dir が存在しない場合は \"archive/zip/     ---
                      ディレクトリが存在しません\" を出力して終了                       

  ②                   zip_dir 内の \*.tar.zst を全件収集 →                              ---
                      zst_files（path.ends_with(\".tar.zst\")）。ファイル名昇順ソート   

  ③                   zst_files が空なら \"処理対象なし\" を出力して終了                ---

  ④                   total = zst_files.len() を出力（\"N件のアーカイブを処理します\"） ---

  ⑤                   tmp_dir（zip_dir/tmp_sync/）を create_dir_all で作成              ---

  ⑥ ループ（zst_files 各 zst_path に対して解凍・パース・DB 登録を実行（後述 §2.12.3）   ---
  を enumerate）                                                                        

  ⑦ ループ完了後      fs::remove_dir_all(&tmp_dir) で tmp_sync/ ディレクトリを削除      ---

  ⑧                   \"強制Sync完了\" を println!（UI 側のポーリング終了用）           ---
  ---------------------------------------------------------------------------------------------------------------

**2.12.3 各 tar.zst ファイルの処理ループ**

  ------------------------------------------------------------------------------------------------
  **順序**   **処理内容**                                             **失敗時**
  ---------- -------------------------------------------------------- ----------------------------
  ①          \"i+1 / total 処理中: ファイル名\" を                    ---
             println!（進捗表示）                                     

  ②          File::open(&zst_path) で tar.zst を開く                  失敗 →
                                                                      スキップ（次のファイルへ）

  ③          zstd::stream::Decoder::new(file) で zstd                 失敗 → スキップ
             デコーダーを作成                                         

  ④          tar::Archive::new(decoder) で tar アーカイブを作成       ---

  ⑤          archive.unpack(&tmp_dir) で tmp_sync/                    失敗 → eprintln
             ディレクトリへ展開（ファイルシステムに実際に書き出す）   して次のファイルへ

  ⑥          fs::read_dir(&tmp_dir) で展開された .txt ファイルを走査  ---

  ⑦          ファイルごとに SELECT EXISTS で重複チェック → 未処理なら パースエラー → eprintln
             parse_and_import 実行                                    してスキップ

  ⑧          パース後は fs::remove_file(&extracted_path)              ---
             で展開済みファイルを削除                                 
  ------------------------------------------------------------------------------------------------

> *⚠ 強制 Sync はキャンセル機能を実装していない。進捗通知は JSON
> ではなくプレーンテキストの println!。in-memory での解凍ではなく
> tmp_sync/ ディレクトリへの実ファイル展開方式を採用している。*

**2.13 エラー処理方針**

  -----------------------------------------------------------------------------
  **エラー種別**             **処理方針**
  -------------------------- --------------------------------------------------
  PlanetariumSetting.json    PlanetariumSetting::default()
  読み込み失敗               で続行。エラーログなし

  DB 接続失敗                ? で Result 伝搬 → main() が Err を返して exit

  archive_dir 取得失敗       eprintln して run_normal_mode / run_force_sync を
                             Ok(()) で終了（処理なし）

  個別ファイルのパース失敗   eprintln してスキップ。tar.zst
                             化は行わない（次回起動時に再処理）

  tar.zst 化失敗             eprintln のみ。raw ログは残る（次回
                             run_normal_mode で再試行される）

  強制 Sync 中の解凍失敗     eprintln して次のアーカイブへ
  -----------------------------------------------------------------------------

**2.14 処理シーケンス概要（通常モード）**

  -------------------------------------------------------------------------------
  **フェーズ**              **処理内容**
  ------------------------- -----------------------------------------------------
  起動                      load_setting() → get_effective_db_path() →
                            Connection::open → PRAGMA WAL → execute_batch(SCHEMA)
                            → 引数確認

  差分特定（通常モード）    collect_log_files(archive_dir) で raw ログ全件取得 →
                            各ファイルに SELECT EXISTS で処理済み判定

  パース（1ファイルずつ）   FILE_SHARE_READ オープン → ダミー INSERT → BufReader
                            逐次読み込み → 状態機械パースループ → ログ末尾処理 →
                            UPDATE → COMMIT

  圧縮・削除                compress_to_tar_zst: Encoder(level=1) → tar::Builder
                            → append_path → remove_file（1 関数内で完結）

  完了                      println!(\"処理完了\") → exit(0)
  -------------------------------------------------------------------------------

**3. 付録: 旧設計書からの変更点一覧**

本セクションは実装コードと旧設計書（v1.0）の差異を網羅する。旧設計書を参照していた場合は本表に基づいて認識を修正すること。

**3.1 Polaris.exe の変更点**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **項目**                       **旧設計書の記述**                                 **実装の実際**
  -------- ------------------------------ -------------------------------------------------- --------------------------------------------------------------
  1        パス解決方式                   install_dir を exe の相対パスで解決                %LOCALAPPDATA% 環境変数を直接使用（lib.rs / config.rs 共通）

  2        tmp コピーのファイル名         install_dir/app/Polaris/polaris_setting_tmp.json   元ファイルと同ディレクトリの
                                                                                             PolarisSetting.json.tmp（path.with_extension(\"json.tmp\")）

  3        ログフォーマット               \[YYYY-MM-DD HH:MM:SS\] {レベル} {メッセージ}      \[YYYY-MM-DD HH:MM:SS\] \[モジュール名\]
                                                                                             メッセージ（レベルフィールドなし）

  4        ログファイルの共有モード       FILE_SHARE_READ のみ                               FILE_SHARE_READ \| FILE_SHARE_WRITE \|
                                                                                             FILE_SHARE_DELETE（全共有）

  5        バックアップ重複ガード         ファイル名の存在チェックのみ                       存在チェック + 更新日時比較（src.modified() \> dest.modified()
                                                                                             なら上書き）

  6        RegisterApplicationRestart     起動から 60 秒後（タイマー）                       起動直後（backup_logs・check_capacity
           の呼び出しタイミング                                                              後に即時呼び出し）。タイマーなし

  7        UnregisterApplicationRestart   タスクトレイ終了時に呼ぶ                           未実装。呼ばない

  8        マイグレーションの移行元対応   ディレクトリコピーのみ                             ディレクトリコピー + ZIP
                                                                                             ファイル展開（extract_zip_to_dir）の2パターン対応

  9        依存クレート                   walkdir・zip なし                                  walkdir（2.5.0）・zip（8.1.0）が追加

  10       タスクトレイアイコン           polaris_icon.ico（.ico 形式）                      icon.png（.png 形式）。image クレートで into_rgba8() して
                                                                                             from_rgba() に渡す

  11       タスクトレイのイベントループ   tray-icon のみ                                     tray-icon + tao（EventLoopBuilder）の組み合わせ

  12       VRChat 終了検知時の設定        スレッド起動時のスナップショット                   load_setting_with_tmp_copy() を再度呼んで最新設定を取得

  13       監視ループの sleep 位置        ループ末尾                                         ループ先頭（先に 5 秒 sleep してから処理）
  ---------------------------------------------------------------------------------------------------------------------------------------------------------

**3.2 Planetarium.exe の変更点**

  ----------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **項目**                     **旧設計書の記述**                  **実装の実際**
  -------- ---------------------------- ----------------------------------- --------------------------------------------------------------------
  1        パス解決方式                 install_dir を exe の相対パスで解決 %LOCALAPPDATA% 環境変数を直接使用（config.rs）

  2        差分判定方式                 SELECT log_filename FROM            各ファイルに対して SELECT EXISTS(SELECT 1 \... WHERE log_filename =
                                        app_sessions を全件取得して HashSet ?1) を 1 件ずつ実行
                                        を構築                              

  3        app_sessions の INSERT 方式  全行バッファリング後に正確な値で    ダミー行（start_time=\'\'）を先に INSERT OR IGNORE してsession_id
                                        INSERT                              を取得。最後に UPDATE で正確な値に更新

  4        圧縮レベル                   デフォルトレベル 3                  レベル 1（高速優先）

  5        tar.zst 後の raw ログ削除    存在確認後に削除                    compress_to_tar_zst 関数内で直接 remove_file。存在確認なし

  6        Privacy                      user_id を NULL として保存          表示名を \"\[LocalPlayer\]\" または \"\[User_Masked\]\"
           モードのプレイヤー保存                                           に置換して保存（NULL ではなく実文字列）

  7        is_local 判定条件            RE_IS_LOCAL マッチのみ              RE_IS_LOCAL に加えて、dname == \"\[LocalPlayer\]\" \|\|
                                                                            line.contains(\"(Local)\") でも is_local = 1

  8        強制 Sync の解凍方式         in-memory（ファイル書き出しなし）   tmp_sync/
                                                                            ディレクトリに実際に展開（archive.unpack(&tmp_dir)）。処理後に削除

  9        強制 Sync のキャンセル機能   実装あり（cancelled フラグ）        未実装

  10       強制                         stdout に JSON 出力                 stdout にプレーンテキスト println!（\"強制Sync完了\" /
           Sync・通常モードの完了通知                                       \"処理完了\"）

  11       PRAGMA foreign_keys          ON に設定                           未設定（SCHEMA に FK 定義はあるが PRAGMA は発行しない）

  12       my_display_name の保存       Privacy モードで NULL / Tracking    Privacy モードで \"\[LocalPlayer\]\"（NULL ではない）/ Tracking
                                        モードで実名                        モードで実名
  ----------------------------------------------------------------------------------------------------------------------------------------------
