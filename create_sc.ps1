
$WshShell = New-Object -comObject WScript.Shell

$sc1 = $WshShell.CreateShortcut("C:\Users\kaimu\OneDrive\デスクトップ\ビルドショートカット\LBTインストーラー出力先.lnk")
$sc1.TargetPath = "F:\DEVELOPFOLDER\RE-NAME-SYS\LogBackupTool\target\release\bundle\nsis"
$sc1.Save()

$sc2 = $WshShell.CreateShortcut("C:\Users\kaimu\OneDrive\デスクトップ\ビルドショートカット\PRAインストーラー出力先.lnk")
$sc2.TargetPath = "F:\DEVELOPFOLDER\RE-NAME-SYS\PhotoRenameApp\src-tauri\target\release\bundle\nsis"
$sc2.Save()
