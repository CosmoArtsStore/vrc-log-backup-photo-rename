!macro customInit
  # インストール先を強制的に LocalAppData に変更する
  StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\LogBackUpTool"
!macroend

!macro customInstall
  # 必要なフォルダ階層の作成
  CreateDirectory "$INSTDIR"
  CreateDirectory "$INSTDIR\LogBackUp"
  
  # SteamVRマニフェストの登録
  # Main Appである PhotoReNameApp.exe に -install-manifest を渡して実行させる
  # (内部的に LogBackUpTool.exe を対象としてマニフェストが生成される)
  ExecWait '"$INSTDIR\PhotoReNameApp.exe" -install-manifest'
!macroend

!macro customUninstall
  # SteamVRマニフェストの解除（ファイルを消す前に実行）
  ExecWait '"$INSTDIR\PhotoReNameApp.exe" -uninstall-manifest'

  # アンインストール時、自作のフォルダ全体を完全に削除する
  # RMDir /r を使い、内部のログファイル等を含めて強制的に消去する
  RMDir /r "$LOCALAPPDATA\CosmoArtsStore\LogBackUpTool"
!macroend
