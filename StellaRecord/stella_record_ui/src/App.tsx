import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

// --- Types ---
interface PolarisSetting {
  archivePath: string;
  capacityThresholdBytes: number;
  enableStartup: boolean;
  migrationStatus: string;
  migrationSourcePath: string;
}

interface PlanetariumSetting {
  archivePath: string;
  dbPath: string;
}

interface AppCard {
  name: string;
  description: string;
  path: string;
  icon_path?: string;
}

type Section = "polaris" | "planetarium" | "pleiades" | "jewelbox";

function App() {
  const [activeSection, setActiveSection] = useState<Section>("polaris");
  const [polarisSetting, setPolarisSetting] = useState<PolarisSetting>({
    archivePath: "",
    capacityThresholdBytes: 10 * 1024 * 1024 * 1024,
    enableStartup: true,
    migrationStatus: "done",
    migrationSourcePath: ""
  });
  const [planetariumSetting, setPlanetariumSetting] = useState<PlanetariumSetting>({
    archivePath: "",
    dbPath: ""
  });
  const [pleiadesApps, setPleiadesApps] = useState<AppCard[]>([]);
  const [jewelBoxApps, setJewelBoxApps] = useState<AppCard[]>([]);
  const [toasts, setToasts] = useState<{ id: number, msg: string }[]>([]);
  const [planetariumRunning, setPlanetariumRunning] = useState(false);
  const [planetariumProgress, setPlanetariumProgress] = useState("");
  const [planetariumStatus, setPlanetariumStatus] = useState("");
  const [polarisRunning, setPolarisRunning] = useState(false);
  const [polarisLogs, setPolarisLogs] = useState<string[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);

  const addToast = useCallback((msg: string, duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const running: boolean = await invoke("get_polaris_status");
      setPolarisRunning(running);
      if (running) {
        const logs: string[] = await invoke("get_polaris_logs");
        setPolarisLogs(logs);
      }
    } catch (e) {
      console.error("Polling error", e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const pol: PolarisSetting = await invoke("get_polaris_config");
      const plt: PlanetariumSetting = await invoke("get_planetarium_config");
      setPolarisSetting(pol);
      setPlanetariumSetting(plt);

      const plJson: string = await invoke("read_launcher_json", { filename: "PleiadesPath.json" });
      const jbJson: string = await invoke("read_launcher_json", { filename: "JewelBoxPath.json" });
      setPleiadesApps(JSON.parse(plJson));
      setJewelBoxApps(JSON.parse(jbJson));
    } catch (e) {
      console.error(e);
      addToast("データのロードに失敗しました");
    }
  }, [addToast]);

  useEffect(() => {
    const init = async () => {
      await loadAll();
    };
    init();

    const unlistenProgress = listen("planetarium-progress", (event: { payload: string }) => {
      setPlanetariumProgress(String(event.payload).replace("[PROGRESS] ", ""));
    });

    const unlistenStatus = listen("planetarium-status", (event: { payload: string }) => {
      setPlanetariumStatus(String(event.payload).replace("[STATUS] ", ""));
    });

    // §5.4 Planetarium 終了イベントの監視
    const unlistenPromise = listen("planetarium-finished", () => {
      setPlanetariumRunning(false);
      setPlanetariumProgress("");
      setPlanetariumStatus("");
      addToast("Planetariumの処理が完了しました");
      loadAll();
    });

    // ポーリング開始
    const timer = setInterval(pollStatus, 3000);

    return () => {
      unlistenProgress.then(u => u());
      unlistenStatus.then(u => u());
      unlistenPromise.then(u => u());
      clearInterval(timer);
    };
  }, [loadAll, pollStatus, addToast]);

  // --- Actions ---
  const handleSavePolaris = async () => {
    try {
      await invoke("save_polaris_config", { setting: polarisSetting });
      addToast("Polaris設定を保存しました");
      // §12.1 設定反映タイミングの周知
      setTimeout(() => {
        addToast("設定はPolaris.exeには即時反映されません。即時反映する場合、タスクトレイからPolaris.exeを再起動してください。", 6000);
      }, 1000);
    } catch (e: unknown) {
      addToast("保存失敗: " + String(e));
    }
  };

  const handleSavePlanetarium = async () => {
    try {
      await invoke("save_planetarium_config", { setting: planetariumSetting });
      addToast("Planetarium設定を保存しました");
    } catch (e: unknown) {
      addToast("保存失敗: " + String(e));
    }
  };

  const handleManualBackup = async () => {
    try {
      const res: string = await invoke("execute_manual_backup");
      addToast(res);
    } catch (e: unknown) {
      addToast("エラー: " + String(e));
    }
  };

  const handleSync = async (force: boolean) => {
    try {
      setPlanetariumRunning(true);
      setPlanetariumProgress("0%");
      setPlanetariumStatus("起動中...");
      const res: string = await invoke("launch_planetarium", { forceSync: force });
      addToast(res);
    } catch (e: unknown) {
      setPlanetariumRunning(false);
      addToast("実行失敗: " + String(e));
    }
  };

  const handleCancelSync = async () => {
    try {
      await invoke("cancel_planetarium");
      addToast("キャンセルリクエストを送信しました");
    } catch (e: unknown) {
      addToast("キャンセル失敗: " + String(e));
    }
  };

  const handleLaunchApp = async (path: string) => {
    try {
      await invoke("launch_external_app", { appPath: path });
      addToast("アプリを起動しました");
    } catch (e: unknown) {
      addToast("起動失敗: " + String(e));
    }
  };

  const browseFolder = async (current: string) => {
    const selected = await open({ directory: true, multiple: false, defaultPath: current });
    return (selected && typeof selected === "string") ? selected : null;
  };

  // --- Renderers ---
  const renderPolaris = () => (
    <div className="section">
      <div className="section-header">
        <h2>Polaris</h2>
        <p>VRChat ログバックアップ デーモン設定</p>
      </div>

      <div className="card">
        <h3>バックアップ設定</h3>
        <div className="form-group">
          <label>保存先フォルダ (archivePath)</label>
          <div className="input-row">
            <input type="text" value={polarisSetting.archivePath} onChange={e => setPolarisSetting({ ...polarisSetting, archivePath: e.target.value })} placeholder="空欄でデフォルトパスを使用" />
            <button className="btn-secondary" onClick={async () => {
              const p = await browseFolder(polarisSetting.archivePath);
              if (p) setPolarisSetting({ ...polarisSetting, archivePath: p });
            }}>参照</button>
          </div>
        </div>

        <div className="form-group">
          <label>容量警告閾値 (GB)</label>
          <input type="number" value={polarisSetting.capacityThresholdBytes / (1024 ** 3)} onChange={e => setPolarisSetting({ ...polarisSetting, capacityThresholdBytes: Number(e.target.value) * (1024 ** 3) })} />
        </div>

        <label className="checkbox-group">
          <input type="checkbox" checked={polarisSetting.enableStartup} onChange={e => setPolarisSetting({ ...polarisSetting, enableStartup: e.target.checked })} />
          <span>Windows起動時に自動実行する</span>
        </label>

        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn-primary" onClick={handleSavePolaris}>設定を保存</button>
        </div>
      </div>

      <div className="card">
        <h3>管理操作</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div className={`status-badge ${polarisRunning ? 'running' : 'stopped'}`}>
            {polarisRunning ? '稼働中' : '停止中'}
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>
            {polarisRunning ? '常駐アプリが自動監視を行っています。' : '手動実行が可能です。'}
          </p>
        </div>
        <button className="btn-success" onClick={handleManualBackup} disabled={polarisRunning}>
          手動バックアップ実行
        </button>
      </div>

      <div className="card">
        <h3>実行ログ (polaris_appinfo.log)</h3>
        <div className="log-viewer">
          {polarisLogs.length === 0 && <div className="log-line">ログはありません。</div>}
          {polarisLogs.map((line: string, i: number) => (
            <div key={i} className="log-line">{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );

  const renderPlanetarium = () => (
    <div className="section">
      <div className="section-header">
        <h2>Planetarium</h2>
        <p>ログ解析・DB管理</p>
      </div>

      <div className="card">
        <h3>DB設定</h3>
        <div className="form-group">
          <label>DB保存先 (dbPath)</label>
          <div className="input-row">
            <input type="text" value={planetariumSetting.dbPath} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlanetariumSetting({ ...planetariumSetting, dbPath: e.target.value })} placeholder="空欄でデフォルトパスを使用" />
          </div>
        </div>
        <button className="btn-primary" onClick={handleSavePlanetarium}>設定を保存</button>
      </div>

      <div className="card">
        <h3>DB更新</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-primary" onClick={() => handleSync(false)} disabled={planetariumRunning}>
            {planetariumRunning ? '実行中...' : '最新化 (差分インポート)'}
          </button>
          <button className="btn-danger" onClick={() => handleSync(true)} disabled={planetariumRunning}>
            {planetariumRunning ? '実行中...' : '強制Sync (全解析再構築)'}
          </button>
        </div>
        {planetariumRunning && (
          <div className="mt-4 p-4 bg-gray-800 rounded border border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">進捗: {planetariumProgress}</span>
              <button
                onClick={handleCancelSync}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-xs rounded transition-colors"
              >
                キャンセル
              </button>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: planetariumProgress.includes('%') ? planetariumProgress : '0%' }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 truncate">{planetariumStatus}</p>
          </div>
        )}
        <p className="note" style={{ marginTop: '1rem' }}>※強制Syncは既存のDBに重複させず、archive/zip/ 配下の全 zst を再パースします。</p>
      </div>
    </div>
  );

  const renderLauncher = (apps: AppCard[], title: string) => (
    <div className="section">
      <div className="section-header">
        <h2>{title}</h2>
        <p>アプリケーション ランチャー</p>
      </div>
      <div className="launcher-grid">
        {apps.length === 0 && <p style={{ color: 'var(--text-dim)' }}>登録されているアプリはありません。</p>}
        {apps.map((app, idx) => (
          <div key={idx} className="app-card" onClick={() => handleLaunchApp(app.path)}>
            <div className="app-icon">
              {app.icon_path ? <img src={app.icon_path} alt="" /> : <span>{app.name[0]}</span>}
            </div>
            <div className="app-info">
              <div className="app-name">{app.name}</div>
              <div className="app-desc">{app.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>STELLA RECORD</h1>
        </div>
        <div className={`nav-item ${activeSection === "polaris" ? "active" : ""}`} onClick={() => setActiveSection("polaris")}>
          <span className="nav-icon">✧</span> Polaris
        </div>
        <div className={`nav-item ${activeSection === "planetarium" ? "active" : ""}`} onClick={() => setActiveSection("planetarium")}>
          <span className="nav-icon">❂</span> Planetarium
        </div>
        <div className={`nav-item ${activeSection === "pleiades" ? "active" : ""}`} onClick={() => setActiveSection("pleiades")}>
          <span className="nav-icon">❃</span> Pleiades
        </div>
        <div className={`nav-item ${activeSection === "jewelbox" ? "active" : ""}`} onClick={() => setActiveSection("jewelbox")}>
          <span className="nav-icon">💎</span> JewelBox
        </div>
        <div style={{ marginTop: 'auto', padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          v0.5.0
        </div>
      </div>

      <div className="main-content">
        {activeSection === "polaris" && renderPolaris()}
        {activeSection === "planetarium" && renderPlanetarium()}
        {activeSection === "pleiades" && renderLauncher(pleiadesApps, "Pleiades")}
        {activeSection === "jewelbox" && renderLauncher(jewelBoxApps, "JewelBox")}
      </div>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
