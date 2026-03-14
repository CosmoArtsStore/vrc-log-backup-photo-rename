$rootPath = "F:\DEVELOPFOLDER\STELLAProject"
$excludeDirs = @(".git", "node_modules", "target", "dist", ".gemini", ".agents", "artifacts", "brain")

function Get-FileEncoding($filePath) {
    if ((Get-Item $filePath).Length -eq 0) { return "Empty" }
    
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    
    # Check BOMs
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return "UTF-8 BOM"
    }
    if ($bytes.Length -ge 2) {
        if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { return "UTF-16 LE" }
        if ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { return "UTF-16 BE" }
    }

    # Check for Binary (contains null bytes away from UTF-16 context or lots of non-text)
    $nullCount = 0
    $lowCharCount = 0
    $totalToCheck = [Math]::Min($bytes.Length, 1024)
    for ($i = 0; $i -lt $totalToCheck; $i++) {
        if ($bytes[$i] -eq 0) { $nullCount++ }
        if ($bytes[$i] -lt 7 -or ($bytes[$i] -gt 14 -and $bytes[$i] -lt 32)) { $lowCharCount++ }
    }
    if ($nullCount -gt 2 -or $lowCharCount -gt ($totalToCheck * 0.1)) {
        return "Binary/Unknown"
    }

    # Try UTF-8 (strict)
    try {
        $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
        $utf8Strict.GetString($bytes) | Out-Null
        
        # Check if it's pure ASCII
        $isAscii = $true
        foreach ($b in $bytes) {
            if ($b -ge 128) { $isAscii = $false; break }
        }
        if ($isAscii) { return "ASCII (subset of UTF-8)" }
        return "UTF-8"
    } catch {
        # Not UTF-8
    }

    # Try Shift-JIS
    try {
        # Check if it contains characteristic Shift-JIS bytes
        # This is a rough check
        return "Shift-JIS (Potential)"
    } catch {
        return "Unknown Text"
    }
}

$files = Get-ChildItem -Path $rootPath -Recurse -File | Where-Object {
    $shouldExclude = $false
    foreach ($dir in $excludeDirs) {
        if ($_.FullName -like "*\$dir\*") {
            $shouldExclude = $true
            break
        }
    }
    return -not $shouldExclude
}

$results = foreach ($file in $files) {
    if ($file.Length -gt 1MB) { 
        $enc = "Large File (Skipped)"
    } else {
        $enc = Get-FileEncoding $file.FullName
    }
    [PSCustomObject]@{
        FullName = $file.FullName
        Encoding = $enc
    }
}

$results | Where-Object { $_.Encoding -ne "UTF-8" -and $_.Encoding -ne "ASCII (subset of UTF-8)" -and $_.Encoding -ne "UTF-8 BOM" -and $_.Encoding -ne "Empty" -and $_.Encoding -ne "Binary/Unknown" -and $_.Encoding -ne "Large File (Skipped)" } | Select-Object FullName, Encoding | Format-Table -AutoSize
