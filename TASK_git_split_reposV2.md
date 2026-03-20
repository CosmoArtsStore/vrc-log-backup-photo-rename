# TASK: monorepo → 3独立リポジトリへの分割

## 🔴 現在のステータス（2026-03-20時点）

**Step 0（GitHubリポジトリ作成）が未完了のためブロック中。**

以下3リポジトリがまだ存在しないため、push作業は実行できない：

- `https://github.com/CosmoArtsStore/Alpheratz` → `Repository not found`
- `https://github.com/CosmoArtsStore/StellaRecord` → `Repository not found`
- `https://github.com/CosmoArtsStore/Polaris` → `Repository not found`

**次のアクション：** GitHubでStep 0を実施し、各URLへの疎通確認後にStep 1から再開する。

以下の認識差異は解消済み（2026-03-20確定）：

| 項目 | 決定 |
|---|---|
| `UserTools/`・`AITools/` | monorepo（`vrc-log-backup-photo-rename`）にのみ残す。分割リポジトリには含めない |
| ルート `package.json` / `package-lock.json` | 各分割リポジトリに含める |

---

## 前提

- ワークスペースルートは `F:/DEVELOPFOLDER/STELLAProject`（ドライブ: `F:/`, ボリュームラベル: T7）
- 現在のワークスペース全体が `CosmoArtsStore/vrc-log-backup-photo-rename` としてGitHub（origin）に接続済み
- AlpheratzとSTELLARECORDの連携実装は完了済み
- 作業対象は `.gitignore` の編集と各アプリの新規リモートへのpushのみ。**ソースコードの変更は一切行わない**
- **既存の `origin`（`CosmoArtsStore/vrc-log-backup-photo-rename`）は変更・削除しない**

---

## 現在のワークスペース構成（参考）

```
F:/DEVELOPFOLDER/STELLAProject
├── .gitignore
├── rust-toolchain.toml     ← ビルドファイル（各リポジトリに含める）
├── AGENTS.md               ← 各リポジトリに含める
├── package.json            ← 各リポジトリに含める
├── package-lock.json       ← 各リポジトリに含める
├── public/
│   └── AppIcon/
│       ├── Polaris/
│       ├── STELLARECORD/
│       ├── Alpheratz/
│       └── Mira/
├── .agents/                ← 各リポジトリに含める
│   ├── workflows/
│   ├── rules/
│   └── skills/
├── Alpheratz/              ← Alpheratzリポジトリに含める
├── StellaRecord/           ← StellaRecordリポジトリに含める（内部にCargo.toml・Cargo.lock含む）
├── Polaris/                ← Polarisリポジトリに含める
├── UserTools/              ← monorepoにのみ残す（除外）
└── AITools/                ← monorepoにのみ残す（除外）
```

> ⚠️ `public/AppIcon/` には `Alpheratz/`・`STELLARECORD/`・`Polaris/`・`Mira/` の4ディレクトリが存在する。
> 各アプリの `src-tauri/icons/` にアイコンが含まれていない場合は、対応するサブディレクトリも含めること

---

## 目標状態（作業完了後）

### リモート（GitHub上）新規作成する3リポジトリ

| リポジトリ | URL |
|---|---|
| `CosmoArtsStore/Alpheratz` | `https://github.com/CosmoArtsStore/Alpheratz` |
| `CosmoArtsStore/StellaRecord` | `https://github.com/CosmoArtsStore/StellaRecord` |
| `CosmoArtsStore/Polaris` | `https://github.com/CosmoArtsStore/Polaris` |

### ローカル（monorepoの外・別ディレクトリ）

```
<任意のクローン先>/
  Alpheratz/    ← CosmoArtsStore/Alpheratzをcloneしたもの
  StellaRecord/ ← CosmoArtsStore/StellaRecordをcloneしたもの
  Polaris/      ← CosmoArtsStore/Polarisをcloneしたもの
```

---

## 作業手順

### Step 0: GitHubに3つの空リポジトリを作成

GitHub上（CosmoArtsStoreオーガニゼーション）で以下を新規作成する：

- `CosmoArtsStore/Alpheratz`
- `CosmoArtsStore/StellaRecord`
- `CosmoArtsStore/Polaris`

> ⚠️ README・.gitignore・ライセンスはすべて**なし**で作成（空のまま）

---

### Step 1: Alpheratzリポジトリにpush

#### `.gitignore` の編集内容

以下を**除外**する（追跡対象から外す）：

```
# Alpheratz以外のアプリ
StellaRecord/
Polaris/

# monorepoにのみ残すフォルダ
UserTools/
AITools/

public/AppIcon/STELLARECORD/
public/AppIcon/Polaris/
public/AppIcon/Mira/

# ビルド成果物
**/target/
**/node_modules/
```

**追跡対象として残るもの（確認する）：**

- `Alpheratz/`
- `rust-toolchain.toml`
- `package.json` / `package-lock.json`
- `AGENTS.md`
- `.agents/`
- `public/AppIcon/Alpheratz/`（アイコンが他に存在しない場合）

#### 作業コマンド

```bash
# 追跡対象ファイルを確認
git status

# すでにgit管理下のファイルをキャッシュから除外（必要な場合）
git rm -r --cached StellaRecord/ Polaris/ UserTools/ AITools/

# リモートを追加してpush
git remote add alpheratz-remote https://github.com/CosmoArtsStore/Alpheratz.git
git push alpheratz-remote main
```

---

### Step 2: StellaRecordリポジトリにpush

#### `.gitignore` の編集内容

以下を**除外**する：

```
# StellaRecord以外のアプリ
Alpheratz/
Polaris/

# monorepoにのみ残すフォルダ
UserTools/
AITools/

public/AppIcon/Alpheratz/
public/AppIcon/Polaris/
public/AppIcon/Mira/

# ビルド成果物
**/target/
**/node_modules/
```

**追跡対象として残るもの（確認する）：**

- `StellaRecord/`（内部の `Cargo.toml`・`Cargo.lock` を含む）
- `rust-toolchain.toml`
- `package.json` / `package-lock.json`
- `AGENTS.md`
- `.agents/`
- `public/AppIcon/STELLARECORD/`（アイコンが他に存在しない場合）

#### 作業コマンド

```bash
git status
git rm -r --cached Alpheratz/ Polaris/ UserTools/ AITools/
git remote add stellarecord-remote https://github.com/CosmoArtsStore/StellaRecord.git
git push stellarecord-remote main
```

---

### Step 3: Polarisリポジトリにpush

#### `.gitignore` の編集内容

以下を**除外**する：

```
# Polaris以外のアプリ
Alpheratz/
StellaRecord/

# monorepoにのみ残すフォルダ
UserTools/
AITools/

public/AppIcon/Alpheratz/
public/AppIcon/STELLARECORD/
public/AppIcon/Mira/

# ビルド成果物
**/target/
**/node_modules/
```

**追跡対象として残るもの（確認する）：**

- `Polaris/`
- `rust-toolchain.toml`
- `package.json` / `package-lock.json`
- `AGENTS.md`
- `.agents/`
- `public/AppIcon/Polaris/`（アイコンが他に存在しない場合）

#### 作業コマンド

```bash
git status
git rm -r --cached Alpheratz/ StellaRecord/ UserTools/ AITools/
git remote add polaris-remote https://github.com/CosmoArtsStore/Polaris.git
git push polaris-remote main
```

---

### Step 4: 全リポジトリをフレッシュクローンして最終確認

monorepoの**外（別ディレクトリ）**に移動して以下を実行する：

```bash
git clone https://github.com/CosmoArtsStore/Alpheratz.git Alpheratz
git clone https://github.com/CosmoArtsStore/StellaRecord.git StellaRecord
git clone https://github.com/CosmoArtsStore/Polaris.git Polaris
```

#### 確認項目

- [ ] `Alpheratz/` にAlpheratz関連ファイルのみ存在し、`StellaRecord/`・`Polaris/` フォルダがない
- [ ] `StellaRecord/` にStellaRecord関連ファイルのみ存在する
- [ ] `Polaris/` にPolaris関連ファイルのみ存在する
- [ ] 各リポジトリで `git remote -v` を実行し、`origin` が正しいGitHub URLを向いている
- [ ] 各リポジトリに `.agents/` と `AGENTS.md` が含まれている
- [ ] 各リポジトリに `rust-toolchain.toml` が含まれている
- [ ] 各リポジトリに `package.json` / `package-lock.json` が含まれている
- [ ] どのリポジトリにも `UserTools/`・`AITools/` が存在しない

---

## 注意事項

- `.gitignore` の編集は**各pushの直前**に行い、毎回 `git status` で追跡対象を確認してからpushすること
- すでにgit管理下にあるファイルを `.gitignore` で後から除外する場合は `git rm --cached` が必要（ファイルはローカルに残る）
- 既存の `origin`（`CosmoArtsStore/vrc-log-backup-photo-rename`）は**変更・削除しない**
- monorepoのローカルブランチ・コミット履歴はそのまま残して問題ない
- `StellaRecord/` 内にすでに `Cargo.toml`・`Cargo.lock` が存在するため、ルートにワークスペース用 `Cargo.toml` が別途ある場合は含めるか確認すること
