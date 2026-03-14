$rootPath = "F:\DEVELOPFOLDER\STELLAProject"
$excludeDirs = @(".git", "node_modules", "target", "dist", ".gemini", ".agents")
$extensions = @("rs", "ts", "tsx", "js", "jsx", "html", "css", "json", "md", "toml", "yml", "yaml", "sh", "bat", "ps1", "sql")

function Test-IsUtf8($filePath) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        if ($bytes.Length -eq 0) { return "Empty" }
        
        # Check for UTF-8 BOM
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            return "UTF-8 BOM"
        }
        
        # Check for valid UTF-8 sequence
        try {
            $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
            $utf8.GetString($bytes) | Out-Null
            return "UTF-8"
        } catch {
            return "Non-UTF-8 or Corrupt"
        }
    } catch {
        return "Error Reading"
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
    $ext = $_.Extension.TrimStart('.')
    if ($extensions -contains $ext -and -not $shouldExclude) {
        return $true
    }
    return $false
}

$results = foreach ($file in $files) {
    $encoding = Test-IsUtf8 $file.FullName
    [PSCustomObject]@{
        FullName = $file.FullName
        Encoding = $encoding
    }
}

$results | Where-Object { $_.Encoding -ne "UTF-8" -and $_.Encoding -ne "UTF-8 BOM" -and $_.Encoding -ne "Empty" } | Select-Object FullName, Encoding | Format-Table -AutoSize
