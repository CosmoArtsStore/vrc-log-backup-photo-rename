!macro NSIS_HOOK_PREINSTALL
    nsExec::Exec 'taskkill /F /IM Polaris.exe 2>nul'
!macroend

!macro NSIS_HOOK_POSTINSTALL
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Polaris" '"$INSTDIR\${MAINBINARYNAME}.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    nsExec::Exec 'taskkill /F /IM Polaris.exe 2>nul'
!macroend
