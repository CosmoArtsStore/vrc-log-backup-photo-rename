!macro tauri_init
    ; §3.1 / §945: 統合環境ディレクトリ配下の個別の場所にインストール
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\STELLARECORD\app\Alpheratz"
!macroend

!macro tauri_pre_install
    ; §900: WM_CLOSE 送信による優雅な停止を試みる
    FindWindow $0 "" "Alpheratz"
    SendMessage $0 16 0 0 ; WM_CLOSE
    Sleep 1000
    ExecWait "taskkill /F /IM Alpheratz.exe"
!macroend

!macro tauri_pre_uninstall
    ExecWait "taskkill /F /IM Alpheratz.exe"
    RMDir /r "$INSTDIR"
!macroend
