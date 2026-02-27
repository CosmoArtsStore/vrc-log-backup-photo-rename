import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Folder, Search, Check, X, ChevronsDown } from "lucide-react";
import "./App.css";

interface RenamePreview {
  old_name: string;
  new_name: string;
  old_path: string;
  new_path: string;
  world_name: string;
}

interface Preferences {
  target_dir: string;
  max_log_capacity_gb: number;
}

interface LbtConfig {
  backupDestinationPath: string;
  capacityThresholdBytes: number;
  enableStartup: boolean;
}

interface MockLogEntry {
  filename: string;
  date: string;
}

function App() {
  const [targetDir, setTargetDir] = useState("");

  const [previews, setPreviews] = useState<RenamePreview[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isRollbackMode, setIsRollbackMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [lbtConfig, setLbtConfig] = useState<LbtConfig | null>(null);
  const [mockLogs, setMockLogs] = useState<MockLogEntry[]>([]);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      const prefs: Preferences = await invoke("get_preferences_cmd");
      setTargetDir(prefs.target_dir || "");
    } catch (err: any) {
      console.error(err);
    }
  }

  // 自動保存用関数
  async function saveDirPreference(path: string) {
    try {
      await invoke("save_preferences_cmd", {
        prefs: {
          target_dir: path,
          max_log_capacity_gb: 2.0, // Rust側が保持する設定を維持
        },
      });
      setSuccessMsg("✔️ 対象ディレクトリを保存しました。");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg("設定の保存に失敗しました: " + err.toString());
    }
  }

  async function handleSelectTargetFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (selected && typeof selected === "string") {
      setTargetDir(selected);
      saveDirPreference(selected);
    }
  }

  async function scanFiles() {
    setIsRollbackMode(false);
    if (!targetDir) {
      setErrorMsg("Please select a target directory.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setIsScanning(true);
    try {
      const results: RenamePreview[] = await invoke("preview_renames", {
        photoDir: targetDir,
      });
      setPreviews(results);
      if (results.length > 0) {
        setShowModal(true);
      } else {
        setErrorMsg("リネーム可能なファイルが見つかりません。");
      }
    } catch (err: any) {
      setErrorMsg(err.toString());
    } finally {
      setIsScanning(false);
    }
  }

  async function scanRollbacks() {
    setIsRollbackMode(true);
    if (!targetDir) {
      setErrorMsg("Please select a target directory.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setIsScanning(true);
    try {
      const results: RenamePreview[] = await invoke("preview_rollbacks", {
        photoDir: targetDir,
      });
      setPreviews(results);
      if (results.length > 0) {
        setShowModal(true);
      } else {
        setErrorMsg("元に戻せるファイルが見つかりません。");
      }
    } catch (err: any) {
      setErrorMsg(err.toString());
    } finally {
      setIsScanning(false);
    }
  }

  async function executeRename() {
    try {
      const count: number = await invoke("execute_renames", {
        items: previews,
      });
      alert(`✅ ${count} 個のファイルのリネームが完了しました！`);
      setShowModal(false);
      setPreviews([]);
    } catch (err: any) {
      alert("Error: " + err.toString());
    }
  }

  async function loadLbtConfig() {
    try {
      const config: LbtConfig = await invoke("get_lbt_config");
      setLbtConfig(config);
      setSuccessMsg("LBT設定を読み込みました");
    } catch (err: any) {
      setErrorMsg("LBT設定の読み込みに失敗しました: " + err.toString());
    }
  }

  async function loadMockLogs() {
    try {
      const logs: MockLogEntry[] = await invoke("sync_and_read_logs");
      setMockLogs(logs);
      setSuccessMsg("ログを同期しました");
    } catch (err: any) {
      setErrorMsg("ログの同期に失敗しました: " + err.toString());
    }
  }

  return (
    <div className="app-layout" data-theme="skyblue">
      {/* Main Content Area (1カラム) */}
      <main className="main-content">
        <header className="content-header">
          <div className="header-icon">
            <Search size={32} />
          </div>
          <h2>VRChat 写真リネーマー</h2>
          <p>指定フォルダ内のVRChat写真にワールド名を自動追加します</p>
        </header>

        <div className="content-body">
          <div className="card">
            {errorMsg && <div className="error-box">{errorMsg}</div>}
            {successMsg && <div className="success-msg">{successMsg}</div>}

            <div className="form-group">
              <label>対象ディレクトリ (リネームおよびログ保存先)</label>
              <div className="input-row">
                <input
                  type="text"
                  value={targetDir}
                  readOnly
                  placeholder="対象フォルダを変更する..."
                />
                <button onClick={handleSelectTargetFolder} className="btn-icon">
                  <Folder size={18} />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            <div className="action-buttons">
              <button
                className="btn-primary scan-btn main-action"
                onClick={scanFiles}
                disabled={isScanning || !targetDir}
              >
                <Search size={20} />
                <span>{isScanning ? "Scanning..." : "Scan & Preview"}</span>
              </button>

              <button
                className="btn-warning scan-btn undo-action"
                onClick={scanRollbacks}
                disabled={isScanning || !targetDir}
              >
                <span>Undo (元に戻す)</span>
              </button>
            </div>

            <div className="demo-section" style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
              <h3>デモ機能: LBT連携</h3>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button className="btn-secondary" onClick={loadLbtConfig}>LBT設定を読み込む</button>
                <button className="btn-secondary" onClick={loadMockLogs}>ログを同期・読み込む</button>
              </div>

              {lbtConfig && (
                <div style={{ marginTop: '10px', fontSize: '0.9em', backgroundColor: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '4px' }}>
                  <h4>LBT Config:</h4>
                  <p>Backup Path: {lbtConfig.backupDestinationPath || "(Default)"}</p>
                  <p>Capacity: {(lbtConfig.capacityThresholdBytes / 1024 / 1024 / 1024).toFixed(2)} GB</p>
                  <p>Startup Enabled: {lbtConfig.enableStartup ? "Yes" : "No"}</p>
                </div>
              )}

              {mockLogs.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '0.9em', backgroundColor: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '4px' }}>
                  <h4>同期されたログ (モック):</h4>
                  <ul>
                    {mockLogs.map((log, i) => (
                      <li key={i}>{log.date} - {log.filename}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{isRollbackMode ? "ロールバック(元に戻す)の確認" : "リネームの確認"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">以下のファイルが{isRollbackMode ? "元に戻すことが可能" : "リネーム可能"}です。変更しますか？ (対象: {previews.length} 件)</p>

              <div className="preview-grid">
                {previews.map((p, idx) => (
                  <div className="preview-card" key={idx}>
                    <div className="preview-img-wrapper">
                      <img
                        src={convertFileSrc(p.old_path)}
                        alt="preview"
                        className="photo-preview"
                      />
                    </div>
                    <div className="preview-info">
                      <div className="file-name old-name" title={p.old_name}>{p.old_name}</div>
                      <div className="rename-arrow">
                        <ChevronsDown size={14} />
                      </div>
                      <div className="file-name new-name" title={p.new_name}>{p.new_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="btn-success" onClick={executeRename}>
                <Check size={18} />
                <span>OK (Rename All)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
