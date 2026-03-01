!macro NSIS_HOOK_PREINSTALL
    ExecWait "taskkill /F /IM STELLA_RECORD.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ExecWait "taskkill /F /IM STELLA_RECORD.exe"
!macroend
