# LocalAppData\CosmoArtsStore に cast, import, app, backup を作成し、
# キャストリストを cast\cast-data.csv として保存する。
# 実行: PowerShell -ExecutionPolicy Bypass -File scripts\setup-cosmoarts-store.ps1

$base = Join-Path $env:LOCALAPPDATA "CosmoArtsStore"
$castDir = Join-Path $base "cast"
$importDir = Join-Path $base "import"
$appDir = Join-Path $base "app"
$backupDir = Join-Path $base "backup"

$sourceCast = Join-Path $PSScriptRoot ".." "app" "common" "キャストリスト - キャストリスト.csv"

if (-not (Test-Path $sourceCast)) {
    Write-Error "キャストリストが見つかりません: $sourceCast"
    exit 1
}

New-Item -ItemType Directory -Force -Path $castDir | Out-Null
New-Item -ItemType Directory -Force -Path $importDir | Out-Null
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$destCast = Join-Path $castDir "cast-data.csv"
Copy-Item -Path $sourceCast -Destination $destCast -Force
Write-Host "OK: $base"
Write-Host "  cast\cast-data.csv を作成しました。"
