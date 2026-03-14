$rootPath = "F:\DEVELOPFOLDER\STELLAProject"
$excludeDirs = @(".git", "node_modules", "target", "dist", ".gemini", ".agents", "artifacts", "brain")
$reportPath = "$rootPath\tmp\encoding_report.csv"

# Ensure tmp directory exists
if (-not (Test-Path "$rootPath\tmp")) { New-Item -ItemType Directory -Path "$rootPath\tmp" }

function Get-FileEncoding($filePath) {
    try {
        $fileInfo = Get-Item $filePath
        if ($fileInfo.Length -eq 0) { return "Empty" }
        if ($fileInfo.Length -gt 5MB) { return "Large File (Skipped)" }
        
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        
        # Check BOMs
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            return "UTF-8 BOM"
        }
        if ($bytes.Length -ge 2) {
            if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { return "UTF-16 LE" }
            if ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { return "UTF-16 BE" }
        }

        # Check for Binary (Heuristic)
        $nullCount = 0
        $lowCharCount = 0
        $nonAsciiCount = 0
        $totalToCheck = [Math]::Min($bytes.Length, 4096)
        for ($i = 0; $i -lt $totalToCheck; $i++) {
            $b = $bytes[$i]
            if ($b -eq 0) { $nullCount++ }
            if ($b -lt 7 -or ($b -gt 14 -and $b -lt 32)) { $lowCharCount++ }
            if ($b -ge 128) { $nonAsciiCount++ }
        }
        
        # If it has nulls or too many control chars, it's probably binary
        if ($nullCount -gt 2 -or $lowCharCount -gt ($totalToCheck * 0.1)) {
            return "Binary/System"
        }

        # Try UTF-8 (strict)
        try {
            $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
            $utf8Strict.GetString($bytes) | Out-Null
            if ($nonAsciiCount -eq 0) { return "UTF-8 (ASCII Only)" }
            return "UTF-8"
        } catch {
            # Not valid UTF-8
        }

        # Try Shift-JIS as a fallback for Japanese text
        try {
            $sjis = [System.Text.Encoding]::GetEncoding("shift-jis", [System.Text.EncoderFallback]::ExceptionFallback, [System.Text.DecoderFallback]::ExceptionFallback)
            $sjis.GetString($bytes) | Out-Null
            return "Shift-JIS (Potential)"
        } catch {
            # Not valid Shift-JIS
        }

        return "Unknown/Other"
    } catch {
        return "Error Reading ($($_.Exception.Message))"
    }
}

$files = Get-ChildItem -Path $rootPath -Recurse -File | Where-Object {
    $fullName = $_.FullName
    $shouldExclude = $false
    foreach ($dir in $excludeDirs) {
        if ($fullName -match "\\$([Regex]::Escape($dir))\\") {
            $shouldExclude = $true
            break
        }
    }
    return -not $shouldExclude
}

$results = foreach ($file in $files) {
    $enc = Get-FileEncoding $file.FullName
    [PSCustomObject]@{
        RelativePath = $file.FullName.Replace($rootPath + "\", "")
        Encoding = $enc
        Size = $file.Length
    }
}

$results | Export-Csv -Path $reportPath -NoTypeInformation -Encoding utf8
Write-Host "Report generated at: $reportPath"
Write-Host "Total files checked: $($results.Count)"

# Summary statistics
$results | Group-Object Encoding | Select-Object Name, Count | Format-Table -AutoSize
