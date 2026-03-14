!macro NSIS_HOOK_PREINSTALL
    ; taskkill は nsExec で非表示・バックグラウンド実行する。
    nsExec::Exec 'taskkill /F /IM ${MAINBINARYNAME}.exe 2>nul'
!macroend

!macro NSIS_HOOK_POSTINSTALL
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Polaris" '"$INSTDIR\${MAINBINARYNAME}.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ; taskkill は nsExec で非表示・バックグラウンド実行する。
    nsExec::Exec 'taskkill /F /IM ${MAINBINARYNAME}.exe 2>nul'
!macroend
