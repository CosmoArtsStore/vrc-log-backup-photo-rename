!macro tauri_init
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\PhotoRenameApp"
!macroend

!macro tauri_pre_install
    ExecWait "taskkill /F /IM PhotoReNameApp.exe"
!macroend

!macro tauri_post_install
    ExecWait '"$INSTDIR\PhotoReNameApp.exe" -install-manifest'
!macroend

!macro tauri_pre_uninstall
    ExecWait '"$INSTDIR\PhotoReNameApp.exe" -uninstall-manifest'
    ExecWait "taskkill /F /IM PhotoReNameApp.exe"
    RMDir /r "$LOCALAPPDATA\CosmoArtsStore\PhotoRenameApp"
!macroend
