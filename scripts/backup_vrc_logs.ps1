$sourceDir = Join-Path $env:USERPROFILE "AppData\LocalLow\VRChat\VRChat"
$destDir = Join-Path $env:USERPROFILE "AppData\Local\CosmoArtsStore\RenameSys"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
}

if (Test-Path $sourceDir) {
    # output_log_*.txt を取得
    $files = Get-ChildItem -Path $sourceDir -Filter "output_log_*.txt" -File
    
    foreach ($file in $files) {
        $destFile = Join-Path $destDir $file.Name
        
        # コピー先にファイルが存在しない場合、またはコピー元の方が新しい場合のみコピー
        if (-not (Test-Path $destFile)) {
            Copy-Item -Path $file.FullName -Destination $destFile -Force
            Write-Output "Copied new log: $($file.Name)"
        } else {
            $destFileInfo = Get-Item $destFile
            if ($file.LastWriteTime -gt $destFileInfo.LastWriteTime) {
                Copy-Item -Path $file.FullName -Destination $destFile -Force
                Write-Output "Updated log: $($file.Name)"
            }
        }
    }
}
