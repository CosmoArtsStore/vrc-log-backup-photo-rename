!macro NSIS_HOOK_PREINSTALL
    ; taskkill は nsExec で非表示・バックグラウンド実行する。
    nsExec::Exec 'taskkill /F /IM ${MAINBINARYNAME}.exe 2>nul'
!macroend

!macro NSIS_HOOK_POSTINSTALL
    ; AlpheratzはUIアプリのため、スタートアップ自動登録なし
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    ; taskkill は nsExec で非表示・バックグラウンド実行する。
    nsExec::Exec 'taskkill /F /IM ${MAINBINARYNAME}.exe 2>nul'
!macroend
