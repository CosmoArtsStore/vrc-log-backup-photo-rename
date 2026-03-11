!macro NSIS_HOOK_PREINSTALL
    nsExec::Exec 'taskkill /F /IM Alpheratz.exe 2>nul'
!macroend

!macro NSIS_HOOK_POSTINSTALL
    ; AlpheratzはUIアプリのため、スタートアップ自動登録なし
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    nsExec::Exec 'taskkill /F /IM Alpheratz.exe 2>nul'
!macroend
