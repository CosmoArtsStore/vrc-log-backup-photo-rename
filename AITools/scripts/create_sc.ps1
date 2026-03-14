
$WshShell = New-Object -comObject WScript.Shell

$sc1 = $WshShell.CreateShortcut("C:\Users\kaimu\OneDrive\デスクトップ\ビルドショートカット\SR_UIインストーラー出力先.lnk")
$sc1.TargetPath = "F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\stella_record_ui\src-tauri\target\release\bundle\nsis"
$sc1.Save()

$sc2 = $WshShell.CreateShortcut("C:\Users\kaimu\OneDrive\デスクトップ\ビルドショートカット\Alpheratzインストーラー出力先.lnk")
$sc2.TargetPath = "F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\pleiades_alpheratz\src-tauri\target\release\bundle\nsis"
$sc2.Save()
