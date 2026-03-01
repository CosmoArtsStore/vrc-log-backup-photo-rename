; §945: デフォルトのインストール先を正す（$LOCALAPPDATA\STELLA_RECORD → CosmoArtsStore\STELLA_RECORD）
; Tauri 標準は currentUser で $LOCALAPPDATA\${PRODUCTNAME} になるため、PREINSTALL で上書きする。
!macro NSIS_HOOK_PREINSTALL
    StrCpy $0 $INSTDIR
    ${StrLoc} $1 $0 "CosmoArtsStore" ">"
    StrCmp $1 "" 0 +2
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\STELLARECORD\app\STELLA_RECORD\Alpheratz"
    ; §900: 既存プロセスの終了
    DetailPrint "STELLA_RECORD を終了しています..."
    FindWindow $0 "" "STELLA_RECORD"
    SendMessage $0 16 0 0
    Sleep 2000
    ExecWait "taskkill /IM STELLA_RECORD.exe /T"
    ExecWait "taskkill /IM Polaris.exe /T"
    ExecWait "taskkill /IM Planetarium.exe /T"
    ExecWait "taskkill /IM Alpheratz.exe /T"
!macroend

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
    StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\STELLARECORD\app\STELLA_RECORD\Alpheratz"
!macroend

!macro tauri_post_install
    ; §874 / §11: Polaris.exe をスタートアップに登録
    ; 注: Polaris は独立したインストーラーで管理されるが、
    ; 星系レコード側の設定画面からレジストリを叩く可能性があるため、パスを正確に設定しておく
    ; (実際には Polaris 側のインストーラーで登録されるのが望ましい)
!macroend

!macro tauri_pre_uninstall
    ; 起動中のアプリを終了 (StellaRecord とその子プロセスの Planetarium のみ)
    ExecWait "taskkill /F /IM STELLA_RECORD.exe"
    ExecWait "taskkill /F /IM Planetarium.exe"
    
    ; プログラム本体のみを削除し、共通データは残す設計
    Delete "$INSTDIR\app\Planetarium\Planetarium.exe"
    ; フォルダが空であれば削除
    RMDir "$INSTDIR\app\Planetarium"
    RMDir "$INSTDIR\app"
    Delete "$INSTDIR\STELLA_RECORD.exe"
    RMDir "$INSTDIR"
!macroend
