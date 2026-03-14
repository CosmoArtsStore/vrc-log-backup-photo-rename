# STELLAProject トラブルシューティング

---

## [Polaris] インストーラーのデフォルトパスが古いままになる

### 症状

インストーラーを起動すると、インストール先が以前のパス（例: `...\CosmoArtsStore\STELLARECORD\Polaris`）のままになっており、新しいパス（`...\CosmoArtsStore\STELLAProject\Polaris`）に変わっていない。

### 原因

NSISインストーラーの `RestorePreviousInstallLocation` 関数が、過去のインストール時にレジストリへ保存されたインストール先パスを読み込んで復元するため、コードを変更してもデフォルトパスが上書きされる。

```
HKEY_CURRENT_USER\Software\CosmoArtsStore\Polaris
  (既定) = C:\Users\<username>\AppData\Local\CosmoArtsStore\STELLARECORD\Polaris  ← これが原因
```

### 手動対処手順

#### 方法1: コマンドで削除（推奨）

PowerShell または コマンドプロンプトを開き、以下を実行する：

```powershell
reg delete "HKCU\Software\CosmoArtsStore\Polaris" /f
```

#### 方法2: レジストリエディタで削除

1. `Win + R` → `regedit` を入力して起動
2. 以下のパスに移動：
   ```
   HKEY_CURRENT_USER\Software\CosmoArtsStore\Polaris
   ```
3. `Polaris` キーを右クリック → **削除**

### 確認

レジストリを削除した後、インストーラーを再起動すると `STELLAProject\Polaris` がデフォルトで表示される。

---

## パス規格

このプロジェクト配下のすべてのアプリは以下のパスに統一する：

| 種別 | パス |
|------|------|
| インストール先 (currentUser) | `%LOCALAPPDATA%\CosmoArtsStore\STELLAProject\<AppName>` |
| インストール先 (perMachine) | `%PROGRAMFILES%\CosmoArtsStore\STELLAProject\<AppName>` |
| アーカイブ・データ | `%LOCALAPPDATA%\CosmoArtsStore\STELLAProject\<AppName>\archive` |
| エラーログ | `%LOCALAPPDATA%\CosmoArtsStore\STELLAProject\<AppName>\error_info.log` |
