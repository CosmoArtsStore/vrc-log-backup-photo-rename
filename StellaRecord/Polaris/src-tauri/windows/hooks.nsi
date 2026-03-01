!macro NSIS_HOOK_PREINSTALL
    ExecWait "taskkill /F /IM Polaris.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ExecWait "taskkill /F /IM Polaris.exe"
!macroend
