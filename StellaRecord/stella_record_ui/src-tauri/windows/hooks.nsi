!macro NSIS_HOOK_PREINSTALL
    ExecWait "taskkill /F /IM StellaRecord.exe"
!macroend

!macro NSIS_HOOK_POSTINSTALL
    ; StellaRecordはUIアプリのため、スタートアップ自動登録なし
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ExecWait "taskkill /F /IM StellaRecord.exe"
!macroend
