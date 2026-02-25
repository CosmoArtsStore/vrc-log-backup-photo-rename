# ============================================================
# VRChat 写真リネームスクリプト
# ============================================================
# 概要:
#   VRChat の output_log から「Entering Room」のワールド名を抽出し、
#   写真のタイムスタンプに基づいて、撮影時にいたワールド名を
#   ファイル名に挿入してリネームする。
#
# 使用方法:
#   .\rename_vrc_photos.ps1 -PhotoDir "写真フォルダパス" -LogDir "ログフォルダパス"
#   .\rename_vrc_photos.ps1 -PhotoDir "写真フォルダパス" -LogDir "ログフォルダパス" -DryRun
#
# パラメータ:
#   -PhotoDir : VRChat 写真が格納されたフォルダ
#   -LogDir   : VRChat ログファイル (output_log_*.txt) が格納されたフォルダ
#   -DryRun   : 実際にはリネームせず、変更内容をプレビュー表示する
#
# [変更前] VRChat_2026-02-03_05-59-50.367_2160x3840.png
# [変更後] VRChat_2026-02-03_05-59-50.367_Idle Home_2160x3840.png
# ============================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$PhotoDir,

    [Parameter(Mandatory = $true)]
    [string]$LogDir,

    [switch]$DryRun
)

# ----------------------------------------------------------
# 1. ログファイルからワールド遷移履歴を構築
# ----------------------------------------------------------
# 全ログファイルを収集 (ファイル名にタイムスタンプが含まれる)
$logFiles = Get-ChildItem -Path $LogDir -Filter "output_log_*.txt" | Sort-Object Name

if ($logFiles.Count -eq 0) {
    Write-Host "[ERROR] ログファイルが見つかりません: $LogDir" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " VRChat 写真リネームスクリプト" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] 写真フォルダ : $PhotoDir"
Write-Host "[INFO] ログフォルダ : $LogDir"
Write-Host "[INFO] ログファイル数: $($logFiles.Count)"
if ($DryRun) {
    Write-Host "[INFO] ★ DryRun モード (リネームは実行されません)" -ForegroundColor Yellow
}
Write-Host ""

# ワールド遷移イベントの配列
# 各要素: [PSCustomObject]@{ Timestamp = [datetime]; WorldName = [string] }
$worldEvents = @()

# ログのタイムスタンプ形式: "2026.02.21 23:15:09"
# Entering Room の行: "[Behaviour] Entering Room: Avatar Testing Chamber"
$enterRoomPattern = '\[Behaviour\] Entering Room: (.+)$'
$timestampPattern = '^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})'

foreach ($logFile in $logFiles) {
    Write-Host "[INFO] ログ解析中: $($logFile.Name)" -ForegroundColor Gray

    # ログファイルのファイル名から開始日を推測 (output_log_2026-02-21_23-14-36.txt)
    # ただし各行にタイムスタンプがあるのでそちらを使用する

    $reader = [System.IO.StreamReader]::new($logFile.FullName, [System.Text.Encoding]::UTF8)
    $currentTimestamp = $null

    while ($null -ne ($line = $reader.ReadLine())) {
        # タイムスタンプを取得
        if ($line -match $timestampPattern) {
            $tsStr = $Matches[1]
            try {
                $currentTimestamp = [datetime]::ParseExact($tsStr, "yyyy.MM.dd HH:mm:ss", $null)
            }
            catch {
                # パース失敗時はスキップ
            }
        }

        # Entering Room を検出
        if ($line -match $enterRoomPattern) {
            $worldName = $Matches[1].Trim()
            # HTMLタグを除去 (ログにはカラータグが含まれることがある)
            $worldName = $worldName -replace '<[^>]+>', ''
            $worldName = $worldName.Trim()

            if ($currentTimestamp -and $worldName) {
                $worldEvents += [PSCustomObject]@{
                    Timestamp = $currentTimestamp
                    WorldName = $worldName
                }
                Write-Host "  [WORLD] $($currentTimestamp.ToString('yyyy-MM-dd HH:mm:ss')) -> $worldName" -ForegroundColor Green
            }
        }
    }
    $reader.Close()
}

if ($worldEvents.Count -eq 0) {
    Write-Host ""
    Write-Host "[ERROR] ワールド遷移イベントが見つかりませんでした。" -ForegroundColor Red
    Write-Host "  ログファイルに '[Behaviour] Entering Room:' の行が含まれているか確認してください。" -ForegroundColor Red
    exit 1
}

# タイムスタンプ順にソート
$worldEvents = $worldEvents | Sort-Object Timestamp

Write-Host ""
Write-Host "[INFO] ワールド遷移イベント数: $($worldEvents.Count)" -ForegroundColor Cyan
Write-Host ""

# ----------------------------------------------------------
# 2. 写真ファイルのタイムスタンプを解析してワールドを特定
# ----------------------------------------------------------
# 写真ファイル名の形式: VRChat_2026-02-03_05-59-50.367_2160x3840.png
$photoPattern = '^(VRChat_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.(\d{3}))_(\d+x\d+)\.(png|jpg|jpeg)$'

$photos = Get-ChildItem -Path $PhotoDir -File | Where-Object { $_.Name -match $photoPattern }

if ($photos.Count -eq 0) {
    Write-Host "[ERROR] VRChat 写真ファイルが見つかりません: $PhotoDir" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] 対象写真ファイル数: $($photos.Count)"
Write-Host ""

# ワールド名をファイル名に使えるようにサニタイズ
function Sanitize-FileName {
    param([string]$Name)
    # ファイル名に使えない文字を置換
    $invalid = [System.IO.Path]::GetInvalidFileNameChars()
    $result = $Name
    foreach ($c in $invalid) {
        $result = $result.Replace([string]$c, '_')
    }
    # 連続アンダースコアを1つにまとめる
    $result = $result -replace '_+', '_'
    $result = $result.Trim('_')
    return $result
}

$renameCount = 0
$skipCount = 0
$noMatchCount = 0

foreach ($photo in $photos) {
    if ($photo.Name -match $photoPattern) {
        $prefix = $Matches[1]          # VRChat_2026-02-03_05-59-50.367
        $year   = $Matches[2]
        $month  = $Matches[3]
        $day    = $Matches[4]
        $hour   = $Matches[5]
        $minute = $Matches[6]
        $second = $Matches[7]
        $ms     = $Matches[8]
        $resolution = $Matches[9]      # 2160x3840
        $ext    = $Matches[10]         # png

        # 写真のタイムスタンプを作成
        $photoTime = [datetime]::new(
            [int]$year, [int]$month, [int]$day,
            [int]$hour, [int]$minute, [int]$second,
            [int]$ms
        )

        # 写真撮影時にいたワールドを特定
        # -> 写真タイムスタンプ以前で最も新しいワールド遷移イベントを取得
        $matchedWorld = $null
        for ($i = $worldEvents.Count - 1; $i -ge 0; $i--) {
            if ($worldEvents[$i].Timestamp -le $photoTime) {
                $matchedWorld = $worldEvents[$i].WorldName
                break
            }
        }

        if (-not $matchedWorld) {
            Write-Host "[SKIP] $($photo.Name) - 対応するワールドが見つかりません (写真時刻: $($photoTime.ToString('yyyy-MM-dd HH:mm:ss')))" -ForegroundColor Yellow
            $noMatchCount++
            continue
        }

        # 既にワールド名が挿入されている場合はスキップ
        $sanitizedWorld = Sanitize-FileName -Name $matchedWorld
        $newName = "${prefix}_${sanitizedWorld}_${resolution}.${ext}"

        if ($photo.Name -eq $newName) {
            Write-Host "[SKIP] $($photo.Name) - 既にリネーム済み" -ForegroundColor Gray
            $skipCount++
            continue
        }

        # 同名ファイルが既に存在する場合
        $newPath = Join-Path $PhotoDir $newName
        if (Test-Path $newPath) {
            Write-Host "[SKIP] $($photo.Name) - 同名ファイルが既に存在: $newName" -ForegroundColor Yellow
            $skipCount++
            continue
        }

        if ($DryRun) {
            Write-Host "[PREVIEW] $($photo.Name)" -ForegroundColor White
            Write-Host "       -> $newName" -ForegroundColor Green
            Write-Host "          (ワールド: $matchedWorld)" -ForegroundColor DarkGray
        }
        else {
            try {
                Rename-Item -Path $photo.FullName -NewName $newName -ErrorAction Stop
                Write-Host "[RENAMED] $($photo.Name)" -ForegroundColor White
                Write-Host "       -> $newName" -ForegroundColor Green
            }
            catch {
                Write-Host "[ERROR] リネーム失敗: $($photo.Name) -> $newName" -ForegroundColor Red
                Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        $renameCount++
    }
}

# ----------------------------------------------------------
# 3. 結果サマリー
# ----------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 処理完了" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[結果] リネーム対象 : $renameCount 件"
Write-Host "[結果] スキップ     : $skipCount 件"
Write-Host "[結果] マッチなし   : $noMatchCount 件"
if ($DryRun) {
    Write-Host ""
    Write-Host "[INFO] DryRun モードのため実際のリネームは行われていません。" -ForegroundColor Yellow
    Write-Host "       実行するには -DryRun を外してください。" -ForegroundColor Yellow
}
