$targetLbt = "F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\stella_record_ui\src-tauri\target\release\bundle\nsis"
$targetPra = "F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\pleiades_alpheratz\src-tauri\target\release\bundle\nsis"
$shortcutDir = "C:\Users\kaimu\OneDrive\デスクトップ\ビルドショートカット"

if (!(Test-Path -Path $shortcutDir)) {
    New-Item -ItemType Directory -Path $shortcutDir
}

$WshShell = New-Object -comObject WScript.Shell

$ShortcutLbt = $WshShell.CreateShortcut($shortcutDir + "\LBTインストーラー出力先.lnk")
$ShortcutLbt.TargetPath = $targetLbt
$ShortcutLbt.Save()

$ShortcutPra = $WshShell.CreateShortcut($shortcutDir + "\PRAインストーラー出力先.lnk")
$ShortcutPra.TargetPath = $targetPra
$ShortcutPra.Save()

Write-Host "Shortcuts created successfully."
