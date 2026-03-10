!macro NSIS_HOOK_PREINSTALL
    ExecWait "taskkill /F /IM Alpheratz.exe"
!macroend

!macro NSIS_HOOK_POSTINSTALL
    ; AlpheratzはUIアプリのため、スタートアップ自動登録なし
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ExecWait "taskkill /F /IM Alpheratz.exe"
!macroend
