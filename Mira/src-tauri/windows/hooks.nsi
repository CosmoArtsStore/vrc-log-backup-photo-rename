!macro NSIS_HOOK_PREINSTALL
    ExecWait "taskkill /F /IM Mira.exe"
!macroend

!macro NSIS_HOOK_POSTINSTALL
    ; Miraはスタートアップ登録不要
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ExecWait "taskkill /F /IM Mira.exe"
!macroend
