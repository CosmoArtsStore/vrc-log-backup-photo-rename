!macro tauri_init
    ; インストール先を統合ディレクトリ配下の Polaris フォルダに固定
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\STELLARECORD\app\Polaris"
!macroend

!macro tauri_pre_install
    ExecWait "taskkill /F /IM Polaris.exe"
!macroend

!macro tauri_pre_uninstall
    ExecWait "taskkill /F /IM Polaris.exe"
    ; プログラム本体のみを削除し、アーカイブ（archive）は残す
    Delete "$INSTDIR\Polaris.exe"
    RMDir "$INSTDIR"
!macroend
