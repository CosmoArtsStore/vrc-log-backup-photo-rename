# 新アーキテクチャおよびSteamVR連動バックアップの実装計画

ユーザーの要件変更に基づき、1つのTauriアプリだったものを「バックアップ用コンソールアプリ」と「リネーム用GUIアプリ」の2つに分離し、インストール先やSteamVRとの連動方法を再設計します。

## Proposed Changes

### 1. ディレクトリとビルド構成の変更

#### [MODIFY] [tauri.conf.json](file:///f:/DEVELOPFOLDER/RE-NAME-SYS/app/src-tauri/tauri.conf.json)
- `productName` を `PhotoReNameApp` に変更。
- `beforeBuildCommand` で `LogBackUpTool.exe` も同時にビルドするよう設定。
- 生成された `LogBackUpTool.exe` をインストーラーに含めるため、`resources` または NSIS スクリプト側で組み込む設定を追加。

#### [MODIFY] [Cargo.toml](file:///f:/DEVELOPFOLDER/RE-NAME-SYS/app/src-tauri/Cargo.toml)
- マルチバイナリ構成に変更します。
    - `[[bin]] name = "PhotoReNameApp", path = "src/main.rs"`
    - `[[bin]] name = "LogBackUpTool", path = "src/backup_tool.rs"`
- `sysinfo` クレートを追加。（VRChatプロセスの監視用）

### 2. バックアップツール (LogBackUpTool.exe) の実装

#### [NEW] [backup_tool.rs](file:///f:/DEVELOPFOLDER/RE-NAME-SYS/app/src-tauri/src/backup_tool.rs)
- **コンソールアプリ**: 起動するとコンソール（cmd）が立ち上がる形式にします。（常駐動作を明示）
- **プロセス監視とループ構造**:
    1. 起動後、メインループに入り `VRChat.exe` プロセスが開始されるのを待機（または既に起動していれば監視開始）。
    2. `VRChat.exe` が終了（プロセスリストから消える）するまで監視。
    3. 終了を検知したら、直後にコピーせず、**数秒（例：3〜5秒）待機し、VRChatプロセスのファイルロックが完全に解除される猶予を設けます**。
    4. その後、`AppData\LocalLow\VRChat\VRChat` のログを `AppData\Local\CosmoArtsStore\LogBackUpTool\LogBackUp` にコピーします。※失敗した場合は数回のリトライ（指数バックオフ）を実施。
    5. コピー完了後もツールは終了せず、**再び VRChat.exe の起動待機状態に戻ります**（多重起動・再起動対応）。
    6. SteamVR（`vrserver.exe` またはダッシュボード）自体の終了を検知したタイミングでのみ、このツールも終了します。
- **リソース消費の最適化**:
    - `sysinfo` を用いたプロセス監視ループには、**必ず 5秒〜10秒間隔の `sleep` を挟み**、CPU使用率を極限まで抑えます。

### 3. リネームアプリ (PhotoReNameApp.exe) の修正

#### [MODIFY] [main.rs](file:///f:/DEVELOPFOLDER/RE-NAME-SYS/app/src-tauri/src/main.rs)
- **ログ読み取り先の変更**: ログフォルダのパスを `AppData\Local\CosmoArtsStore\LogBackUpTool\LogBackUp` に変更します。
- **マニフェスト登録の役割**: インストール時（または初回起動時）に生成・登録するロジックを引き続き保持しますが、登録対象の実行ファイルを `LogBackUpTool.exe` に設定変更します。

### 4. インストーラー (NSIS) とマニフェスト設定

#### [MODIFY] [hooks.nsi](file:///f:/DEVELOPFOLDER/RE-NAME-SYS/app/src-tauri/windows/hooks.nsi)
- **インストール先の上書き**: Tauriのデフォルト機能に頼らず、インストール先（`$INSTDIR`）を強制的に `$LOCALAPPDATA\CosmoArtsStore\LogBackUpTool` に書き換える処理を追加します。
- **インストール手順**:
    - フォルダーの作成。
    - SteamVRマニフェストの生成と `vrpathreg.exe` による登録実行（前回の成果物を活用）。
- **完全なアンインストール (**重要**)**:
    - アンインストール時は登録解除後、`$LOCALAPPDATA\CosmoArtsStore\LogBackUpTool` フォルダ全体を `RMDir /r` 等を使って**再帰的かつ明示的に削除**し、ゴミ（ログのバックアップ等も含め）を一切残さないようにします。

#### [MODIFY] [manifest.vrmanifest生成の仕様]
- 設定する対象 (binary_path_windows) を `LogBackUpTool.exe` にします。
- これにより「SteamVR が起動したら `LogBackUpTool.exe` が自動起動する」という要件を満たします。

## Verification Plan

### Manual Verification
1. **インストール**: インストーラーを実行すると `AppData\Local\CosmoArtsStore\LogBackUpTool` にファイル群が配置されること。
2. **SteamVR確認**: SteamVRを起動した際に `LogBackUpTool.exe` のコマンドプロンプト画面が起動すること。
3. **バックアップ動作**: VRChatを起動し、終了させた直後にログファイルが `LogBackUpTool\LogBackUp` 内に正しくコピーされること。
6. **GUI動作**: コピーされたログを元に `PhotoReNameApp.exe` が正しく写真のリネーム処理を行えること。

### 5. 追加実装: ユーザー設定 (pref.json) によるパスのカスタマイズ
- **要件**:
    - デフォルトのバックアップ先パスは既存のままにしつつ、ユーザーが任意のバックアップ先（およびリネームアプリの参照先）を指定できるようにする。
    - 設定を毎回指定するのではなく、`pref.json` に保存する仕組みにする。
- **実装内容**:
    1. **バックエンド共有ロジック**: `PhotoReNameApp` と `LogBackUpTool` の両方で `pref.json` を読み書きできる共通の Rust 構造体(`Preferences`)と関数を実装。
        - 保存先ディレクトリ: `AppData\Local\CosmoArtsStore\LogBackUpTool\pref.json`
        - 内容: `{"backup_dir": "デフォルトパス", "photo_dir": "写真のデフォルトパス"}`
    2. **LogBackUpTool の対応**: 起動時とループの都度（または起動時）に `pref.json` を読み込み、ファイルのコピーターゲットとして使用。
    3. **PhotoReNameApp の対応**:
        - Tauriのコマンド (`get_preferences`, `save_preferences`) を追加。
        - ログのバックアップフォルダ読み取り時に `pref.json` のパスを利用。
    4. **フロントエンド (React) の対応**: 
        - 画面上に「設定」等の入力欄を設け、バックアップ先・写真の読み取り先を指定・保存できるようにUIを拡張。
