---
description: Polaris と Planetarium を含む StellaRecord 全体をビルドして、NSIS インストーラーを生成する
---

ランチャー（StellaRecord）と、同梱されるユーティリティ（Polaris, Planetarium）をすべて最新の状態でパッケージングします。

1. ステラレコード全体のビルドを実行
   // turbo
   `cd f:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord; npm run build:StellaRecord`

> [!IMPORTANT]
> このコマンドは内部で `Planetarium.exe` と `Polaris.exe` をビルドし、それらをリソースとして StellaRecord (UI側) に取り込みます。

> [!NOTE]
> 最終的なインストーラー（setup.exe）の場所：
> `f:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\stella_record_ui\src-tauri\target\release\bundle\nsis\`
