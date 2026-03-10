!macro NSIS_HOOK_PREINSTALL
    ExecWait "taskkill /F /IM Mira.exe"
!macroend

!macro NSIS_HOOK_POSTINSTALL
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Mira" '"$INSTDIR\${MAINBINARYNAME}.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ExecWait "taskkill /F /IM Mira.exe"
!macroend
