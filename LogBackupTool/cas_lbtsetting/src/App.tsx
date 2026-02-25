import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface Preferences {
  backupDestinationPath: string;
  capacityThresholdBytes: number;
  enableStartup: boolean;
}

function App() {
  const [pref, setPref] = useState<Preferences>({
    backupDestinationPath: "",
    capacityThresholdBytes: 10_737_418_240, // 10 GB
    enableStartup: true,
  });
  const [capacityGb, setCapacityGb] = useState<number>(10);
  const [message, setMessage] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const p: Preferences = await invoke("get_config");
      setPref(p);
      setCapacityGb(p.capacityThresholdBytes / 1024 / 1024 / 1024);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("設定の読み込みに失敗しました");
    }
  }

  async function handleBrowse() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setPref({ ...pref, backupDestinationPath: selected });
      }
    } catch (e: any) {
      setErrorMsg("フォルダ選択に失敗しました");
    }
  }

  async function saveSettings() {
    setMessage("");
    setErrorMsg("");
    try {
      const pToSave = {
        ...pref,
        capacityThresholdBytes: Math.floor(capacityGb * 1024 * 1024 * 1024)
      };
      await invoke("save_config", { prefs: pToSave });
      alert("設定はバックエンドアプリには即時反映されません。\n即時反映する場合、タスクトレイからアプリを再起動してください。"); // The alert specified in docs
      setMessage("✓ 設定を保存しました。");
      setTimeout(() => setMessage(""), 5000);
    } catch (e: any) {
      setErrorMsg("設定の保存に失敗しました: " + e.toString());
    }
  }

  async function handleManualBackup() {
    setMessage("");
    setErrorMsg("");
    try {
      const msg: string = await invoke("execute_manual_backup");
      setMessage(`実行成功: ${msg}`);
      alert(`✅ ${msg}`);
    } catch (err: any) {
      setErrorMsg("エラー: " + err.toString());
      alert("エラー: " + err.toString());
    }
  }

  return (
    <div className="container">
      <h1>LogBackupTool Settings</h1>

      {message && <div className="msg success">{message}</div>}
      {errorMsg && <div className="msg error">{errorMsg}</div>}

      <div className="card">
        <label>バックアップ保存先フォルダ</label>
        <div className="row">
          <input
            type="text"
            readOnly
            value={pref.backupDestinationPath || "(デフォルト設定を使用)"}
            placeholder="選択してください..."
          />
          <button onClick={handleBrowse}>参照</button>
        </div>
        <p className="note">指定がない場合は、%LOCALAPPDATA%\CosmoArtsStore\LogBackupTool\BackupFile が利用されます。</p>

        <label>容量警告の閾値 ({capacityGb.toFixed(1)} GB)</label>
        <div className="row">
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={capacityGb}
            onChange={(e) => setCapacityGb(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="unit-label">{capacityGb.toFixed(1)} GB</span>
        </div>
        <p className="note">このサイズを超えるとappinfo.logへ警告が記録されます。</p>

        <label>
          <input
            type="checkbox"
            checked={pref.enableStartup}
            onChange={(e) => setPref({ ...pref, enableStartup: e.target.checked })}
          />
          {" "} PC起動時に自動起動する (スタートアップ)
        </label>
        {!pref.enableStartup && <p className="warning-note">⚠️ OFFにするとバックアップが自動実行されなくなります！手動起動が必要です。</p>}

        <div className="actions">
          <button className="btn-save" onClick={saveSettings}>設定を保存する</button>
        </div>
      </div>

      <div className="card additional-actions">
        <h2>手動バックアップ</h2>
        <p>VRChat および OnsiteLogBackupTool.exe が<strong>停止している場合のみ</strong>実行できます。</p>
        <button className="btn-manual" onClick={handleManualBackup}>今すぐ手動でバックアップ実行</button>
      </div>
    </div>
  );
}

export default App;
