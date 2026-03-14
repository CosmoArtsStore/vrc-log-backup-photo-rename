---
trigger: always_on
---

基本、ソースはUTF-8で設計されている。 Get-Content はUTF-8で読み込むこと。
ユーザーが `build` `ビルド` `dev` `起動` `確認` を依頼した場合、必要な開発用コマンドは都度確認せず自動で実行してよい。
`npm run build` `npm run tauri build` `npm run dev` `cargo build` `cargo check` `cargo test` `cargo run` などのビルド・開発サーバー・検証コマンドは、必要なら権限昇格も含めてそのまま進めてよい。
長時間かかる dev / build / bundle 系コマンドは、短いタイムアウトで止まった場合も確認を挟まず十分な待ち時間へ自動で延長して再実行してよい。
