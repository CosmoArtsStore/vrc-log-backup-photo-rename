!macro tauri_pre_install
    ; §900: WM_CLOSE 送信による優雅な停止を試みる
    ; STELLA_RECORD.exe
    DetailPrint "STELLA_RECORD を終了しています..."
    FindWindow $0 "" "STELLA_RECORD"
    SendMessage $0 16 0 0 ; WM_CLOSE = 16
    
    ; Polaris.exe (トレイアプリ)
    ; Polaris はウィンドウを持たないので本来はメッセージを投げるのが難しいが、
    ; 一旦 5秒待機してから強制終了する
    Sleep 2000
    ExecWait "taskkill /IM STELLA_RECORD.exe /T"
    ExecWait "taskkill /IM Polaris.exe /T"
    ExecWait "taskkill /IM Planetarium.exe /T"
    ExecWait "taskkill /IM Alpheratz.exe /T"
!macroend

!macro tauri_init
    ; §945: インストールパスの設定
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\STELLARECORD"
!macroend

!macro tauri_post_install
    ; §874 / §11: Polaris.exe をスタートアップに登録
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Polaris" "$\"$INSTDIR\app\Polaris\Polaris.exe$\""
!macroend

!macro tauri_pre_uninstall
    ; 起動中のアプリを終了
    ExecWait "taskkill /F /IM STELLA_RECORD.exe"
    ExecWait "taskkill /F /IM Polaris.exe"
    ExecWait "taskkill /F /IM Planetarium.exe"
    ExecWait "taskkill /F /IM Alpheratz.exe"
    
    ; スタートアップ登録の削除
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Polaris"

    ; プログラム本体のみを削除し、DBやバックアップは残す設計
    ; (ユーザーが誤ってアンインストールしてもログが消えないようにする)
    RMDir /r "$INSTDIR\app"
    Delete "$INSTDIR\STELLA_RECORD.exe"
!macroend
