# Lessons Learned

## ブランディングと階層構造の定義（STELLAProject エコシステム）
- **Issue**: ブランド名（`STELLAProject`）と個別アプリ名（`STELLA RECORD`, `Polaris`, `Alpheratz`）の混同。Adobeにおける「Adobe Creative Cloud」と「Photoshop」の関係と同じであることを失念し、連携先のアプリ名までブランド名に統合しようとしてしまった。
- **Rule**:
    1. **親ディレクトリ・レジストリパス**: 常にブランド名である **`STELLAProject`** を採用する。（例: `Software\CosmoArtsStore\STELLAProject\[AppName]`）
    2. **個別製品名**: 各アプリは独立した製品（`STELLA RECORD`, `Polaris`, `Alpheratz`）として扱う。
    3. **UI文言・ログ・表示名**: 特に対象がステラレコードなら、スペースあり・すべて大文字の **`STELLA RECORD`** を使用する。
    4. **関数名・内部命名**: Rust/TS の内部的な関数名や変数名では、**`stellarecord`** (小文字、スペースなし) を採用する。（例: `register_to_stellarecord`）
    5. **バイナリ名**: StellaRecord の本体実行ファイル名は **`StellaRecord.exe`** であることを認識し、これに準ずるパス設定は修正不要とする。

## 報告書（現課題.md）における指摘の整合性
- **Issue**: 方針変更により「問題」と「正常」が反転する場合、単なる機械的置換では文脈が崩れる。
- **Rule**:
    - **レジストリ/パスの指摘**: 親が `STELLARECORD` になっているものを「ブランド名（`STELLAProject`）への修正が必要」と指摘する。
    - **UI/連携の指摘**: 連携先が `STELLAProject` になっているものを「アプリ名（`STELLA RECORD`）への修正が必要」と指摘する。
