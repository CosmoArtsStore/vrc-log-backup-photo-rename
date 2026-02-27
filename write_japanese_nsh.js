const fs = require('fs');
const lines = [
    'LangString addOrReinstall ${LANG_JAPANESE} "コンポーネントの追加/再インストール"',
    'LangString alreadyInstalled ${LANG_JAPANESE} "インストール済み"',
    'LangString alreadyInstalledLong ${LANG_JAPANESE} "${PRODUCTNAME} ${VERSION} はすでにインストールされています。実行する操作を選択し次へをクリックしてください。"',
    'LangString appRunning ${LANG_JAPANESE} "{{product_name}} が起動中です！まず閉じてからもう一度試してください。"',
    'LangString appRunningOkKill ${LANG_JAPANESE} "{{product_name}} が起動中です！$\\nOKをクリックして終了しますか？"',
    'LangString chooseMaintenanceOption ${LANG_JAPANESE} "実行するメンテナンス操作を選択してください。"',
    'LangString choowHowToInstall ${LANG_JAPANESE} "${PRODUCTNAME} のインストール方法を選択してください。"',
    'LangString createDesktop ${LANG_JAPANESE} "デスクトップにショートカットを作成する"',
    'LangString dontUninstall ${LANG_JAPANESE} "アンインストールしない"',
    'LangString dontUninstallDowngrade ${LANG_JAPANESE} "アンインストールしない（ダウングレード時のアンインストールが無効です）"',
    'LangString failedToKillApp ${LANG_JAPANESE} "{{product_name}} を終了できませんでした。まず閉じてからもう一度試してください。"',
    'LangString installingWebview2 ${LANG_JAPANESE} "WebView2 をインストール中..."',
    'LangString newerVersionInstalled ${LANG_JAPANESE} "${PRODUCTNAME} の新しいバージョンがすでにインストールされています。実行する操作を選択し次へをクリックしてください。"',
    'LangString older ${LANG_JAPANESE} "古い"',
    'LangString olderOrUnknownVersionInstalled ${LANG_JAPANESE} "${PRODUCTNAME} の $R4 バージョンがインストールされています。アンインストール後にインストールすることをお勧めします。"',
    'LangString silentDowngrades ${LANG_JAPANESE} "このインストーラーではダウングレードが無効です。$\\n"',
    'LangString unableToUninstall ${LANG_JAPANESE} "アンインストールできません！"',
    'LangString uninstallApp ${LANG_JAPANESE} "${PRODUCTNAME} をアンインストール"',
    'LangString uninstallBeforeInstalling ${LANG_JAPANESE} "インストール前にアンインストールする"',
    'LangString unknown ${LANG_JAPANESE} "不明"',
    'LangString webview2AbortError ${LANG_JAPANESE} "WebView2 のインストールに失敗しました。インストーラーを再起動してください。"',
    'LangString webview2DownloadError ${LANG_JAPANESE} "エラー: WebView2 のダウンロードに失敗しました - $0"',
    'LangString webview2DownloadSuccess ${LANG_JAPANESE} "WebView2 のダウンロードに成功しました"',
    'LangString webview2Downloading ${LANG_JAPANESE} "WebView2 をダウンロード中..."',
    'LangString webview2InstallError ${LANG_JAPANESE} "エラー: WebView2 のインストールが終了コード $1 で失敗しました"',
    'LangString webview2InstallSuccess ${LANG_JAPANESE} "WebView2 のインストールに成功しました"',
    'LangString deleteAppData ${LANG_JAPANESE} "アプリケーションデータを削除する"',
];
const content = lines.join('\r\n') + '\r\n';
// NSIS Unicode true requires UTF-16 LE with BOM
const buf = Buffer.concat([
    Buffer.from([0xFF, 0xFE]), // BOM
    Buffer.from(content, 'utf16le')
]);
fs.writeFileSync('F:/DEVELOPFOLDER/RE-NAME-SYS/LogBackupTool/cas_lbtsetting/src-tauri/windows/Japanese.nsh', buf);
console.log('Done: Japanese.nsh written as UTF-16 LE with BOM (' + buf.length + ' bytes)');
