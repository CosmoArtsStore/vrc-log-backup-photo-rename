# Lessons Learned

## 連携パスやファイル名の統一による不整合の防止
- **Issue**: 複数アプリ間 (Polaris, StellaRecord, Alpheratz) で参照するパス（例: アーカイブ先やデータベース保存先）が、大文字・小文字の違いや、新旧の名称(`db`と`database`、`archive`と`log_archive`など)が入り乱れ、正しく連携できていなかった。また、ユーザーから提供された資料のtypo等（`SrtellaRecord` 等）にも注意が必要。
- **Rule**:
    1. 複数のアプリケーション間で共有するファイルやディレクトリのパスを変更・定義する際は、**必ず全体を横断検索**（`grep_search` 等）し、全アプリで名称や大文字・小文字が完全に一致していることを確認すること。
    2. 新しい設定ファイルやDBファイルは、原則として小文字の名前（例: `alpheratz.json`, `alpheratz.db`, `pleiades.json`, `jewelbox.json`）や、統一されたディレクトリ名（`database`, `cache`, `archive`）を採用すること。
    3. ユーザーからの指定パスがあった場合でも、ソースコード上の既存ハードコードパスと照らし合わせ、相互にズレが生じないかを検証・確認してから実装を行うこと（今回はユーザーへの確認手順を踏んだことが成功に繋がった）。

## Polaris ログ同期パスの修正
- **Issue**: Polaris側でのログ退避先が `CosmoArtsStore\StellaRecord\Polaris\archive` となっていたが、全体の統一仕様は `%LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\Polaris\archive` (STELLARECORDが大文字、末尾がarchive) であったため、手動修正後に不整合・コンパイルエラー（`chrono` クレート不足など）が生じた。
- **Rule**:
    1. パス名をハードコーディングする際は、大文字・小文字の完全一致を確認する（`STELLARECORD` か `StellaRecord` かなど）。
    2. 手動修正やソースの移植を行った際は、必ず単体でビルドチェック（`cargo check`等）を実行し、依存関係（Cargo.tomlへの `chrono` 等の追加）が抜けていないかを確認すること。

## 旧名（Planetariumなど）の残存による混乱の防止
- **Issue**: アプリ名を `StellaRecord` に統一したあとも、ソースコード内の変数名やイベント名、さらにはディレクトリ名（`src-tauri/src/planetarium/`）に旧名が残っており、リサーチ時に混乱を招く原因となっている。
- **Rule**:
    1. プロジェクトのリネームを行う際は、テキスト置換だけでなく、**ディレクトリ名やファイル名**（特にモジュールディレクトリやDBファイル名）も一括で変更すること。
    2. Tauriの `emit` イベント名やフロントエンドの `listen` 名も忘れずに置換対象に含めること。
    3. ドキュメント（PDFやHTML、Markdown）内の名称も可能な限り最新化し、デッドリンクや古い説明が残らないようにすること。
