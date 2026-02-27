const fs = require('fs');
const cp = require('child_process');

const shortcutDir = "C:\\Users\\kaimu\\OneDrive\\デスクトップ\\ビルドショートカット";

if (!fs.existsSync(shortcutDir)) {
    fs.mkdirSync(shortcutDir, { recursive: true });
}

const script = `
$WshShell = New-Object -comObject WScript.Shell

$sc1 = $WshShell.CreateShortcut("${shortcutDir}\\LBTインストーラー出力先.lnk")
$sc1.TargetPath = "F:\\DEVELOPFOLDER\\RE-NAME-SYS\\LogBackupTool\\target\\release\\bundle\\nsis"
$sc1.Save()

$sc2 = $WshShell.CreateShortcut("${shortcutDir}\\PRAインストーラー出力先.lnk")
$sc2.TargetPath = "F:\\DEVELOPFOLDER\\RE-NAME-SYS\\PhotoRenameApp\\src-tauri\\target\\release\\bundle\\nsis"
$sc2.Save()
`;

// PowerShell needs BOM to read UTF-8 correctly in Japanese environments
fs.writeFileSync('create_sc.ps1', '\uFEFF' + script, 'utf8');

console.log("Written powershell script. Executing...");
cp.execSync('powershell.exe -ExecutionPolicy Bypass -File create_sc.ps1', { stdio: 'inherit' });
console.log("Shortcuts created!");
