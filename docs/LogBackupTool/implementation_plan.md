# LogBackupTool 実装計画 (Implementation Plan)

## 1. プロジェクト構成のセットアップ
仕様書に定義されている3つのアプリケーションを構築するため、`RE-NAME-SYS/LogBackupTool` フォルダに新しいRustのワークスペースとTauriアプリケーションを作成します。

### 1.1 ディレクトリ設計
```text
f:\DEVELOPFOLDER\RE-NAME-SYS\LogBackupTool\
├── Cargo.toml (Workspace Root)
├── cas_lbt_setting/ (Tauri App: 設定GUI)
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── src/main.rs (CAS_LBTSetting.exe)
│   │   └── build.rs (nsisインストーラー等)
│   ├── src/ (React frontend)
│   └── package.json
├── onsite_log_backup/ (Rust Binary: 常駐アプリ)
│   ├── Cargo.toml
│   └── src/main.rs (OnsiteLogBackupTool.exe)
├── lbt_app_observer/ (Rust Binary: モニタリング)
│   ├── Cargo.toml
│   └── src/main.rs (LBTAppObserver.exe)
└── lbt_core/ (Rust Library: 共通ロジック)
    ├── Cargo.toml
    └── src/
        ├── config.rs (Config.jsonの読み書き)
        └── logger.rs (appinfo.log出力用処理)
```

## 2. 各コンポーネントの実装仕様

### 2.1 lbt_core (共通モジュール)
- **Config.json処理**:
  - パス: `%LOCALAPPDATA%\CosmoArtsStore\LogBackupTool\Backend\Config.json`
  - 対象: `backupDestinationPath` (文字列), `capacityThresholdBytes` (数値/u64), `enableStartup` (論理値)
- **ロガー処理**:
  - `appinfo.log` を `%LOCALAPPDATA%\CosmoArtsStore\LogBackupTool\Backend\appinfo.log` に作成し、起動時に上書き(`Truncate`)する処理。
  - 各アプリが同一のログフォーマット（タイムスタンプ＋メッセージ）で出力できるように共通関数化。

### 2.2 OnsiteLogBackupTool.exe (常駐アプリ)
- **コンソール非表示化**: `windows_subsystem = "windows"` を付与して画面を出さない。
- **異常終了再起動の登録**: Windows API `RegisterApplicationRestart` を起動時に呼び出し、クラッシュ時等の自動再起動をOSへ予約。
- **タスクトレイ登録**: `tray-icon` クレートを利用してシステトレイにアイコンを表示。メニュー右クリックで「終了 (正常終了)」を選択でき、この場合はOS再起動予約を解除（または自発的終了）してプロセスを抜ける。
- **VRChat監視ループ (5秒間隔)**:
  - `sysinfo` クレートで `vrchat.exe` の起動をポーリング。
  - プロセスの開始〜終了をトラッキングし、終了（リストからの消失）をトリガーとしてバックアップ関数を実行する。
- **バックアップ・容量警告処理**:
  - コピー元: `%APPDATA%\..\LocalLow\VRChat\VRChat\output_log*.txt`
  - コピー先: Config.json の `backupDestinationPath` またはデフォルトパス。
  - ディレクトリサイズ監視を行い、`capacityThresholdBytes` (デフォルト10GB) を超えた場合は警告メッセージを `appinfo.log` に吐き出す。

### 2.3 LBTAppObserver.exe (CLIモニタリング)
- **標準コンソール出力**: コンソールウィンドウを表示(`windows_subsystem = "console"`)。
- **ログのテーリング**: `%LOCALAPPDATA%\CosmoArtsStore\LogBackupTool\Backend\appinfo.log` を開き、定期的に末尾までファイルを読む（tail -f 相当）ループを実装。5秒間隔で新規行を取得して画面に出力する。

### 2.4 CAS_LBTSetting.exe (Tauri GUIアプリ)
- **UI (React + Vite)**: 
  - `Config.json` の項目（バックアップパス、容量警告値(GB換算UI)、自動起動のON/OFF）を編集する洗練されたUI。
  - 【手動バックアップ】ボタン。
- **Rust Tauri コマンド**:
  - `get_config`, `save_config` (共通設定の読み書き)。
  - `execute_manual_backup`: バックグラウンドプロセスの存在やVRChatの存在をチェックし、問題なければバックアップを実行。
- **スタートアップ・レジストリ制御**:
  - 保存時または起動時に、UIの `enableStartup`フラグをもとに `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` への登録/削除を行う。

### 2.5 NSIS インストーラーと配置
- Tauri のビルドインNSISスクリプトを拡張するか、カスタムNSISで３つのexeを結合して一つのインストーラーにする。
- 配置:
  - `$INSTDIR\CAS_LBTSetting.exe`
  - `$INSTDIR\Backend\OnsiteLogBackupTool.exe`
  - `$INSTDIR\Backend\LBTAppObserver.exe`
  - ($INSTDIR は `$LOCALAPPDATA\CosmoArtsStore\LogBackupTool` に強制展開)

## 3. 実装ステップ (タスク割り当て)
1. **[環境構築]** Rust Workspace の初期化と Cargo.toml 群の生成。Tauri テンプレートの展開。
2. **[共通モジュール]** `lbt_core` における Config と Log の構造体の実装。
3. **[バックエンド]** `OnsiteLogBackupTool` のタスクトレイ、再起動予約、プロセス監視処理のコアロジック実装。
4. **[モニタリング]** `LBTAppObserver` のログ監視(tail_f)ロジックの実装。
5. **[フロントエンド+GUI]** `CAS_LBTSetting` のUI構築、Rust側のコマンド実装。
6. **[インストーラー統合]** NSIS設定の書き換え、インストーラーでのディレクトリアレンジ、レジストリ登録初期化機能の実装。
