!macro tauri_pre_install
    ; Kill previous instances before unzipping
    ExecWait "taskkill /F /IM OnsiteLogBackupTool.exe"
    ExecWait "taskkill /F /IM LBTAppObserver.exe"
    ExecWait "taskkill /F /IM CAS_LBTSetting.exe"
!macroend

!macro tauri_init
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\LogBackupTool"
!macroend

!macro tauri_post_install
    ; Nothing particular here, Tauri extract files to $INSTDIR.
    ; Startup registry setup is handled byCAS_LBTSetting.exe on first run / initial setting save
!macroend

!macro tauri_pre_uninstall
    ; Kill running apps
    ExecWait "taskkill /F /IM OnsiteLogBackupTool.exe"
    ExecWait "taskkill /F /IM LBTAppObserver.exe"
    ExecWait "taskkill /F /IM CAS_LBTSetting.exe"
    
    ; Delete startup reg keys
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OnsiteLogBackupTool"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LBTAppObserver"

    ; Remove only specific binaries and frontend files, leaving BackupFile intact.
    RMDir /r "$INSTDIR\Backend"
    Delete "$INSTDIR\CAS_LBTSetting.exe"
!macroend
