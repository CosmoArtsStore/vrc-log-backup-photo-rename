# Stargazer（デスクトップ版）

Vercel を使わないローカル exe アプリ版です。**まず開発環境で動作確認してから、exe ビルド**する前提で進めてください。

---

## 流れ（推奨）

1. **セットアップ**（下記）を済ませる  
2. **開発モードで起動**（`npm run tauri dev`）して、ログイン・データ読取・抽選などが動くか確認する  
3. 問題なければ **exe ビルド**（`npm run tauri build`）

---

## 必要な環境

- **Node.js** 18 以上
- **Rust**（[インストール手順](https://www.rust-lang.org/learn/get-started)）
- **Tauri の前提環境**（[Prerequisites](https://tauri.app/start/prerequisites/)）  
  - Windows: Visual Studio Build Tools など

---

## セットアップ

### 1. 依存関係のインストール

```bash
cd desktop
npm install
```

### 2. Google Sheets 用 credentials.json

- **desktop** フォルダに **credentials.json** を置く  
- または `.env` に `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\credentials.json` を書く  
- 中身は Google Cloud のサービスアカウントキー（JSON）で、スプレッドシートの編集権限を持つもの

---

## 開発で動作確認する（ビルドの前に行う）

**desktop フォルダで実行する場合:**

```bash
cd desktop
npm run tauri dev
```

**リポジトリのルート（Stargazer）で実行する場合:**

```bash
npm run tauri:dev
```

- 初回は Rust のコンパイルで数分かかることがあります。
- ウィンドウが開き、データ読取・抽選・マッチングなどが操作できれば OK です。
- ここでエラーや動かない部分があれば、ビルドせずに先に直してください。

**フロントだけ確認したい場合（Rust なし）:**

```bash
npm run dev
```

ブラウザで http://localhost:1420 を開けますが、Sheets 連携は Tauri の Rust 側がないと動きません。**動作確認は `npm run tauri dev` で行う**ことをおすすめします。

---

## 動作確認できたら exe をビルド

**desktop フォルダで:** `npm run tauri build`  
**ルートで:** `npm run tauri:build`

成果物は `src-tauri/target/release/` に出力されます（Windows では `.exe` など）。

---

## Android APK を自分用にビルドする

自分のスマホに APK を入れて使いたい場合の手順です。

### 必要な環境（APK 用）

- 上記のデスクトップ用環境に加えて:
  - **Java JDK 17**（推奨）  
    - [Adoptium](https://adoptium.net/) などでインストールし、`JAVA_HOME` を設定
  - **Android SDK**  
    - 一番簡単なのは **Android Studio** を入れること（JDK と SDK がまとまっている）  
    - インストール後、環境変数 `ANDROID_HOME` を SDK のパスに設定（例: `C:\Users\あなた\AppData\Local\Android\Sdk`）

### 手順

1. **初回だけ** Android 用のプロジェクトを生成:
   ```bash
   cd desktop
   npm run android:init
   ```
2. APK をビルド:
   ```bash
   npm run android:build
   ```
3. 出力された APK をスマホに転送してインストール。  
   成果物は `src-tauri/gen/android/app/build/outputs/apk/` 以下にあります（デバッグ用・リリース用など）。

スマホ側で「提供元不明のアプリ」を許可する必要があります（設定 → セキュリティなど）。

### Windows で symlink エラーになる場合

「ファンクションが間違っています (os error 1)」でビルドが止まる場合:

1. **開発者モード**（設定 → プライバシーとセキュリティ → 開発者向け）をオンにするか、**PowerShell を管理者として実行**してから `npm run android:build` を再試行。
2. それでも symlink で失敗するときは、**コピー用スクリプト**で APK だけ組み立てる:
   - `npm run android:build` を一度実行する（symlink で失敗するが、Rust の `.so` はビルド済みになる）
   - 続けて `.\scripts\android-build-windows.ps1` を実行
   - APK は `src-tauri\gen\android\app\build\outputs\apk\universal\release\` に出力される

---

## 構成メモ

- **フロント**: `src/`（React + TypeScript）
- **バックエンド**: `src-tauri/src/lib.rs`（Google Sheets API）
- デスクトップ版ではログイン画面はなし（起動からメイン画面）

## 注意

- **credentials.json** はリポジトリにコミットしないでください。
