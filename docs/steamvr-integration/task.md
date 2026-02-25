# 新アーキテクチャおよびSteamVR連動バックアップの実装タスク

- [ ] [PLANNING] 実装計画の作成と承認 <!-- id: 0 -->
- [x] [EXECUTION] `tauri.conf.json` および `Cargo.toml` の更新（マルチバイナリ・製品名変更など） <!-- id: 1 -->
- [x] [EXECUTION] Rustバックエンド: `LogBackUpTool` の新規作成と監視ロジックの実装 <!-- id: 2 -->
- [x] [EXECUTION] Rustバックエンド: `PhotoReNameApp` (旧app) の設定・パス調整とマニフェスト生成処理の変更 <!-- id: 3 -->
- [x] [EXECUTION] インストーラー: NSDIS (`hooks.nsi`) の更新（インストール先変更、フォルダー作成、マニフェスト登録などの更新） <!-- id: 4 -->
- [x] [VERIFICATION] ビルド・インストールし、`LogBackUpTool` と `PhotoReNameApp` が設計通りに配置されるか確認 <!-- id: 5 -->
- [x] [VERIFICATION] SteamVR起動時の連動ツール起動、およびVRChat終了時のバックアップ動作検証 <!-- id: 6 -->
- [x] [VERIFICATION] 最終確認とWalkthroughの更新 <!-- id: 7 -->
