# STELLARECORD 共通規約統一対応

実施日: 2026-03-14

## 対応概要
- `STELLARECORD` の未準拠箇所を、共通規約 `\.agents\rules\coding-standard.md` ベースで整理した。
- 併せて、ルート `AGENTS.md` の規約参照先を共通規約へ修正した。

## 実施内容
### 1. フロントエンドの責務分離
- `StellaRecord/stella_record_ui/src/hooks/useAnalyzeState.ts` を追加
  - `analyze-progress` / `analyze-finished` のイベント購読を `App.tsx` から分離
  - 解析開始・停止処理を hook 化
- `StellaRecord/stella_record_ui/src/hooks/useArchiveSelection.ts` を追加
  - アーカイブの複数選択、Shift 範囲選択、ドラッグ選択を `App.tsx` から分離
- `StellaRecord/stella_record_ui/src/App.tsx` を整理
  - `setPolarisRunning(...)` の不整合な残骸を削除
  - 解析状態管理とアーカイブ選択処理を hook 利用へ置換
  - 重複していた作業メモコメントを削除

### 2. バックエンドの記述統一
- `StellaRecord/stella_record_ui/src-tauri/src/analyze/mod.rs`
  - タイムスタンプ解析失敗時の無言スキップをやめ、理由コメント付き `WARN` ログへ変更
- `StellaRecord/stella_record_ui/src-tauri/src/commands.rs`
  - 未使用 import を削除し、`cargo check` の不要警告を解消

### 3. 規約参照の統一
- `AGENTS.md`
  - `.agents/rules/alpheratz-coding-standard.md` を削除
  - `.agents/rules/coding-standard.md` を全Project共通の正規規約として参照する形へ修正

## 確認結果
- `StellaRecord/stella_record_ui`: `node_modules\.bin\tsc.cmd --noEmit` 成功
- `StellaRecord/stella_record_ui/src-tauri`: `cargo fmt --all` 成功
- `StellaRecord/stella_record_ui/src-tauri`: `cargo check --target-dir F:\DEVELOPFOLDER\STELLAProject\target\stella_record_check` 成功

## 補足
- `cargo check` 時の warning は incremental cache の hard link 非対応に関する環境警告のみで、コード警告ではない。
- `App.tsx` は前より整理されたが、今後さらに `database` ビューやモーダル描画を `components` へ分割すると、共通規約上さらに見通しがよくなる。
