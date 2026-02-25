# ログバックアップツール (LogBackupTool) 実装タスク

- [ ] [環境] 新規ワークスペース (LogBackupTool) の作成および Cargo/Tauri のセットアップ <!-- id: 101 -->
- [ ] [コア] 共通モジュール (`lbt_core`): Config.json/appinfo.log 仕様に準拠した読書処理の実装 <!-- id: 102 -->
- [ ] [バックエンド] OnsiteLogBackupTool.exe: タスクトレイ常駐化 (非表示起動), 異常終了再起動の登録 (OS API等) <!-- id: 103 -->
- [ ] [バックエンド] OnsiteLogBackupTool.exe: vrchat.exe監視ループ (5秒), 起動検知と終了後のバックアップ処理 <!-- id: 104 -->
- [ ] [バックエンド] OnsiteLogBackupTool.exe: 定期的なディレクトリ容量監視と閾値超えログの記録 <!-- id: 105 -->
- [ ] [監視UI] LBTAppObserver.exe: コンソールUI, 5秒間隔の appinfo.log tail-f 出力実装 <!-- id: 106 -->
- [ ] [GUI設定] CAS_LBTSetting.exe (Tauri): スタートアップ(HKCU Run) レジストリ登録・解除コマンドの実装 <!-- id: 107 -->
- [ ] [GUI設定] CAS_LBTSetting.exe (Tauri): 依存プロセス停止確認付きの「手動バックアップ」の実装 <!-- id: 108 -->
- [ ] [フロントエンド] CAS_LBTSetting.exe (React): 設定UI画面の構築とポップアップ警告の追加 <!-- id: 109 -->
- [ ] [インストーラー] NSISスクリプト: 既存プロセス停止, `$LOCALAPPDATA`への上書き強制, `Backend`フォルダ構成の作成処理 <!-- id: 110 -->
- [ ] [検証] 全体ビルドおよびインストーラーでの動作確認（バックアップ, 常駐, アンインストールの整合性） <!-- id: 111 -->
