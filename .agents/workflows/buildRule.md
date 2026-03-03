---
description: ビルド手順
---

### 前提条件
- Node.js, Rust, Tauri CLI がインストール済み
- 作業ディレクトリ: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord`

### ビルドコマンド

#### 1. Polaris（独立インストーラー）
```powershell
npm run build:Polaris-pkg
```
**生成物**: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\target\release\bundle\nsis\Polaris_1.0.0_x64-setup.exe`

#### 2. STELLA_RECORD（メインアプリ、planetarium統合済み）
```powershell
npm run build:StellaRecord-pkg
```
**生成物**: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\target\release\bundle\nsis\STELLA_RECORD_1.0.0_x64-setup.exe`

#### 3. Alpheratz（Pleiades）
```powershell
npm run build:Alpheratz-pkg
```
**生成物**: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\target\release\bundle\nsis\Alpheratz_0.1.0_x64-setup.exe`

#### 全アプリ一括ビルド
```powershell
npm run build:Polaris-pkg && npm run build:StellaRecord-pkg && npm run build:Alpheratz-pkg
```
- この手順以外のビルド方法は一切認めない

