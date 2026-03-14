import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Icons } from "./components/Icons";
import { useAnalyzeState } from "./hooks/useAnalyzeState";
import { useArchiveSelection } from "./hooks/useArchiveSelection";
import { useDashboardState } from "./hooks/useDashboardState";
import { useToasts } from "./hooks/useToasts";
import type { AppCard, DangerAction, Section, TableData } from "./types";

function App() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [dbTables, setDbTables] = useState<string[]>([]);
  const [currentTable, setCurrentTable] = useState("");
  const [tableData, setTableData] = useState<TableData>({ columns: [], rows: [] });
  const [showEnhancedSyncModal, setShowEnhancedSyncModal] = useState(false);
  const [decompressMode, setDecompressMode] = useState(false);
  const [archiveFiles, setArchiveFiles] = useState<string[]>([]);

  const [dangerModal, setDangerModal] = useState<{
    action: DangerAction;
    step: 1 | 2;
  } | null>(null);

  const { toasts, addToast } = useToasts();
  const {
    pleiadesApps,
    jewelBoxApps,
    polarisRunning,
    storageStatus,
    pollStorage,
    pollStatus,
  } = useDashboardState();
  const {
    analyzeRunning,
    analyzeProgress,
    analyzeStatus,
    setAnalyzeRunning,
    handleSync,
    handleCancelSync,
  } = useAnalyzeState(pollStorage, addToast);
  const {
    selectedFiles,
    clearSelection,
    handleFileAction,
    handleSelectAll,
  } = useArchiveSelection(archiveFiles);

  const handleLaunch = async (app: AppCard) => {
    try {
      await invoke("launch_external_app", { appPath: app.path });
      addToast(`${app.name} を起動しました`);
    } catch (e) {
      addToast(`エラー: ${e}`);
    }
  };

  const handleOpenFolder = async (app: AppCard) => {
    try {
      const dir = app.path.substring(0, app.path.lastIndexOf("\\"));
      await invoke("open_folder", { path: dir });
    } catch (e) {
      addToast(`エラー: ${e}`);
    }
  };

  const handleStartPolaris = async () => {
    try {
      const res: string = await invoke("start_polaris");
      addToast(res);
      pollStatus();
    } catch (e) {
      addToast(`起動失敗: ${e}`);
    }
  };

  const handleOpenEnhancedSync = async () => {
    try {
      const files: string[] = await invoke("list_archive_files");
      setArchiveFiles(files);
      setShowEnhancedSyncModal(true);
      clearSelection();
      setDecompressMode(false);
    } catch (e) {
      addToast(`ファイル一覧取得失敗: ${e}`);
    }
  };

  const handleExecuteEnhancedSync = async () => {
    if (selectedFiles.size === 0) return;
    try {
      setShowEnhancedSyncModal(false);
      setAnalyzeRunning(true);
      await invoke("launch_enhanced_import", { fileNames: Array.from(selectedFiles) });
    } catch (e) {
      setAnalyzeRunning(false);
      addToast(`強化同期エラー: ${e}`);
    }
  };

  const handleCompressLogs = async () => {
    addToast("アーカイブの圧縮を開始します (レベル3)...");
    try {
      const res: string = await invoke("compress_logs");
      addToast(res);
    } catch (e) {
      addToast(`圧縮エラー: ${e}`);
    } finally {
      pollStorage();
    }
  };

  const handleOpenDecompress = async () => {
    try {
      const files: string[] = await invoke("list_archive_files");
      setArchiveFiles(files);
      setShowEnhancedSyncModal(true);
      clearSelection();
      setDecompressMode(true);
    } catch (e) {
      addToast(`ファイル一覧取得失敗: ${e}`);
    }
  };

  const handleDecompress = async () => {
    if (selectedFiles.size === 0) return;
    try {
      setShowEnhancedSyncModal(false);
      const res: string = await invoke("decompress_logs", { fileNames: Array.from(selectedFiles) });
      addToast(res);
      pollStorage();
    } catch (e) {
      addToast(`展開エラー: ${e}`);
    } finally {
      setDecompressMode(false);
    }
  };

  const handleOpenDatabase = async () => {
    try {
      const tables: string[] = await invoke("get_db_tables");
      setDbTables(tables);
      setActiveSection("database");
      if (tables.length > 0) {
        loadTableData(tables[0]);
      }
    } catch (e) {
      addToast("DBエラー: " + String(e));
    }
  };

  const loadTableData = async (tableName: string) => {
    setCurrentTable(tableName);
    try {
      const data: TableData = await invoke("get_db_table_data", { tableName: tableName });
      setTableData(data);
    } catch (e) {
      addToast("データ読込エラー: " + String(e));
    }
  };

  const handleDeleteTodayData = () => {
    setDangerModal({ action: "deleteToday", step: 1 });
  };

  const handleWipeDatabase = () => {
    setDangerModal({ action: "wipeDatabase", step: 1 });
  };

  const executeDangerAction = async (action: DangerAction) => {
    setDangerModal(null);
    try {
      let res: string;
      if (action === "deleteToday") {
        res = await invoke("delete_today_data");
      } else {
        res = await invoke("wipe_database");
      }
      addToast(res);
    } catch (e) {
      addToast("エラー: " + String(e));
    }
  };

  const advanceDangerModal = () => {
    if (!dangerModal) return;
    if (dangerModal.action === "wipeDatabase" && dangerModal.step === 1) {
      setDangerModal({ ...dangerModal, step: 2 });
    } else {
      executeDangerAction(dangerModal.action);
    }
  };

  // --- Renderers ---
  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // KB単位以下の値を気にするため、小数点2桁を維持しつつ、小さい単位でもしっかり見せる
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const renderDashboard = () => (
    <div className="view-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">STELLA RECORD の各コアモジュールへアクセスします</p>
      </header>

      <div className="storage-card">
        <div className="storage-header">
          <div className="storage-title">
            <Icons.Sparkle /> Archive Storage
            <button className="btn-refresh-storage" onClick={pollStorage} title="更新">
              <Icons.Refresh />
            </button>
          </div>
          <div className="storage-stats">
            {formatSize(storageStatus.current)} /
            {Math.round(storageStatus.limit / (1024 * 1024 * 1024))} GB ({storageStatus.percent.toFixed(1)}%)
          </div>
        </div>
        <div className="storage-track">
          <div
            className={`storage-fill ${storageStatus.percent > 90 ? 'warning' : ''}`}
            style={{ width: `${storageStatus.percent}%` }}
          />
        </div>
      </div>

      <div className="dashboard-grid">
        {/* ANALYZE (TOP WIDE) */}
        <div className="feature-card wide" onClick={() => setActiveSection("analyze")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.Analyze /></div>
            <div className="feature-title">Analyze</div>
          </div>
          <p className="feature-desc">
            VRChatのログを精密に構成・解析し、あなたの足跡をデータベース化します。
          </p>
        </div>

        <div className="feature-card" onClick={() => setActiveSection("pleiades")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.Pleiades /></div>
            <div className="feature-title">Pleiades</div>
          </div>
          <p className="feature-desc">
            CosmoArtsStore製の専用拡張ツール。
          </p>
        </div>

        <div className="feature-card" onClick={() => setActiveSection("jewelbox")}>
          <div className="feature-header">
            <div className="feature-icon"><Icons.JewelBox /></div>
            <div className="feature-title">JewelBox</div>
          </div>
          <p className="feature-desc">
            外部のお気に入りツール一括起動。
          </p>
        </div>
      </div>
    </div>
  );
  const renderPlanetarium = () => (
    <div className="view-container">
      <div className="back-link" onClick={() => setActiveSection("dashboard")}>
        <Icons.ArrowBack /> Dashboardに戻る
      </div>
      <div className="section-header">
        <h2>Analyze Control</h2>
        <p>VRChatの活動ログを解析し、精密なデータベースを構築します</p>
      </div>

      <div className="planetarium-grid">
        <div className="status-card">
          <div className="status-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: analyzeRunning ? '#10b981' : '#86868b' }} />
            エンジン ステータス
          </div>
          <div className="status-value">{analyzeRunning ? 'システム稼働中' : '待機中'}</div>
        </div>
        <div className="status-card">
          <div className="status-label">管理</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="btn-action primary" onClick={handleOpenDatabase} style={{ flex: 1 }}>
              <Icons.Database /> DB開く
            </button>
            <button className="btn-action danger" onClick={handleDeleteTodayData} style={{ flex: 1, padding: '0.5rem' }}>
              今日分削除
            </button>
          </div>
        </div>
      </div>

      {/* 主操作: 2列×2行グリッド */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '10px', background: 'rgba(93, 156, 236, 0.1)', borderRadius: '12px' }}>
            <Icons.Analyze />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>Log Synchronization</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              ログを最新の状態に保つための基本操作
            </p>
          </div>
        </div>

        <div className="sync-grid">
          {/* カード1: データベース更新 */}
          <div className="sync-card">
            <h4>データベース更新</h4>
            <p>Polarisが収集した新しいログのみを解析し、行動履歴DBを効率的に更新します。</p>
            <button className="btn-action primary" style={{ width: '100%' }} onClick={() => handleSync()} disabled={analyzeRunning}>
              {analyzeRunning ? '処理中...' : 'インポート開始'}
            </button>
          </div>

          {/* カード2: 圧縮 */}
          <div className="sync-card">
            <h4>ログアーカイブ最適化</h4>
            <p>過去のログを tar.zst で圧縮し、zstフォルダへ移動。圧縮後は元ファイルを削除します。</p>
            <button className="btn-action" style={{ width: '100%' }} onClick={handleCompressLogs}>
              過去ログを圧縮
            </button>
          </div>

          {/* カード3: zipからも読み取る */}
          <div className="sync-card">
            <h4>zipからも読み取る</h4>
            <p>圧縮済み (.tar.zst) を指定してDBを更新。複数選択・ Shift/Ctrl/ドラッグ対応。</p>
            <button
              className="btn-action primary"
              style={{ width: '100%' }}
              onClick={handleOpenEnhancedSync}
              disabled={analyzeRunning}
            >
              アーカイブを選択
            </button>
          </div>

          {/* カード4: 解凍 */}
          <div className="sync-card">
            <h4>アーカイブを解凍</h4>
            <p>zst フォルダ内の .tar.zst を archive フォルダに .txt として復元。展開確認後に .tar.zst を削除します。</p>
            <button
              className="btn-action"
              style={{ width: '100%' }}
              onClick={handleOpenDecompress}
            >
              解凍する
            </button>
          </div>
        </div>

        {analyzeRunning && (
          <div className="progress-container" style={{ marginTop: '2rem' }}>
            <div className="progress-info">
              <span>インポート進捗</span>
              <span>{analyzeProgress}</span>
            </div>
            <div className="progress-track" style={{ height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                className="progress-fill"
                style={{ height: '100%', background: 'var(--accent-gradient)', width: analyzeProgress.includes('%') ? analyzeProgress.split(' ').pop() : '0%', transition: 'width 0.3s' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{analyzeStatus}</p>
              <span
                style={{ color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                onClick={handleCancelSync}
              >
                停止
              </span>
            </div>
          </div>
        )}
      </div>

      {/* デンジャーゾーンはページ下部に配置—スクロールすると出てくる */}
      <div className="danger-zone-spacer" />
      <div className="warning-zone">
        <div className="warning-header">
          <div className="danger-badge">DANGER</div>
          <Icons.Alert />
          <h4>デンジャーゾーン</h4>
        </div>
        <p className="danger-text">
          これらの操作はデータベースの整合性に影響を与えたり、データを永久に削除する可能性があります。<br />
          通常の使用では実行する必要はありません。
        </p>
        <div className="warning-actions">
          <button className="btn-action danger" onClick={handleDeleteTodayData}>
            今日分の記録を削除
          </button>
          <button className="btn-action danger wipe" onClick={handleWipeDatabase}>
            データベースを完全に初期化
          </button>
        </div>
      </div>
    </div>
  );
  const renderDatabase = () => (
    <div className="view-container" style={{ maxWidth: '100%', padding: '0' }}>
      <div className="back-link" onClick={() => setActiveSection("analyze")}>
        <Icons.ArrowBack /> Analyzeに戻る
      </div>
      <div className="section-header">
        <h2>Database Browser</h2>
        <p>SQLite データベースの全テーブルを照会します (Read-Only)</p>
      </div>

      {/* height は CSS .db-layout で calc() により自動計算 */}
      <div className="db-layout">
        {/* サイドバー: テーブル一覧 */}
        <div className="db-sidebar">
          <div className="db-sidebar-label">Tables</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {dbTables.map(t => (
              <div
                key={t}
                onClick={() => loadTableData(t)}
                className={`db-table-item ${currentTable === t ? 'active' : ''}`}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* メインコンテンツ: テーブルデータ */}
        <div className="db-content">
          <div className="db-content-header">
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Table: {currentTable}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Showing last 100 rows</span>
          </div>
          <div className="db-table-wrap">
            <table className="db-table">
              <thead>
                <tr>
                  {tableData.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.length === 0 && (
                  <tr>
                    <td colSpan={tableData.columns.length} className="db-empty">
                      No data found in this table.
                    </td>
                  </tr>
                )}
                {tableData.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard": return renderDashboard();
      case "analyze": return renderPlanetarium();
      case "pleiades": return (
        <div className="view-container">
          <div className="back-link" onClick={() => setActiveSection("dashboard")}>
            <Icons.ArrowBack /> Dashboardに戻る
          </div>
          <div className="section-header"><h2>Pleiades Tools</h2><p>Extension management</p></div>
          <div className="launcher-grid">
            {pleiadesApps.map(app => (
              <div key={app.name} className="launcher-card">
                <div className="launcher-main" onClick={() => handleLaunch(app)}>
                  <div className="launcher-icon">
                    {app.icon_path ? <img src={`https://asset.localhost/${app.icon_path}`} alt="" /> : <Icons.Pleiades />}
                  </div>
                  <div className="launcher-info"><h3>{app.name}</h3><p>{app.description}</p></div>
                </div>
                <button className="btn-folder" onClick={() => handleOpenFolder(app)} title="フォルダを開く"><Icons.Folder /></button>
              </div>
            ))}
          </div>
        </div>
      );
      case "jewelbox": return (
        <div className="view-container">
          <div className="back-link" onClick={() => setActiveSection("dashboard")}>
            <Icons.ArrowBack /> Dashboardに戻る
          </div>
          <div className="section-header"><h2>JewelBox</h2><p>External tool integration</p></div>
          <div className="launcher-grid">
            {jewelBoxApps.map(app => (
              <div key={app.name} className="launcher-card">
                <div className="launcher-main" onClick={() => handleLaunch(app)}>
                  <div className="launcher-icon"><Icons.JewelBox /></div>
                  <div className="launcher-info"><h3>{app.name}</h3><p>{app.description}</p></div>
                </div>
                <button className="btn-folder" onClick={() => handleOpenFolder(app)} title="フォルダを開く"><Icons.Folder /></button>
              </div>
            ))}
          </div>
        </div>
      );
      case "database": return renderDatabase();
      default: return renderDashboard();
    }
  };

  return (
    <div className="main-wrapper">
      <nav className="top-navigation">
        <div className="logo">
          <Icons.Sparkle /> STELLA RECORD
        </div>
        <div className={`survival-group ${polarisRunning ? 'online' : 'offline'}`}>
          <div className="status-lamp">
            <div className="lamp-dot" />
            <span>Polaris: {polarisRunning ? 'Active' : 'Standby'}</span>
          </div>
          {!polarisRunning && (
            <button className="btn-revive" onClick={handleStartPolaris}>
              Revive
            </button>
          )}
        </div>
      </nav>

      <main className="content-area">
        {renderSection()}
      </main>

      {showEnhancedSyncModal && (
        <div className="modal-overlay fullscreen-modal">
          <div className="modal-content archive-selector">
            <div className="archive-modal-header">
              <div>
                <h3>{decompressMode ? 'アーカイブを解凍' : 'zipからも読み取る'}</h3>
                <p>
                  {decompressMode
                    ? '解凍する .tar.zst ファイルを選択してください。展開確認後に .tar.zst は削除されます。'
                    : '取り込む圧縮ログ（.tar.zst）を選択してください。日付新しい順に並んでいます。'}
                </p>
              </div>
              <div className="archive-modal-meta">
                <span className="archive-count">{selectedFiles.size} / {archiveFiles.length} 件選択中</span>
                <button className="btn-action" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={handleSelectAll}>
                  {selectedFiles.size === archiveFiles.length ? '選択解除' : 'すべて選択'}
                </button>
              </div>
            </div>
            <div className="file-list-container fullscreen-list">
              {archiveFiles.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  zst フォルダ内にアーカイブファイルが見つかりません。<br />
                  先に「過去ログを圧縮」を実行してください。
                </div>
              ) : (
                archiveFiles.map(file => (
                  <div
                    key={file}
                    className={`file-item ${selectedFiles.has(file) ? 'selected' : ''}`}
                    onMouseDown={(e) => handleFileAction(e, file, 'down')}
                    onMouseEnter={(e) => handleFileAction(e, file, 'enter')}
                  >
                    <div className={`file-checkbox ${selectedFiles.has(file) ? 'checked' : ''}`}>
                      {selectedFiles.has(file) && '✓'}
                    </div>
                    <Icons.Folder />
                    <span className="file-name">{file}</span>
                    <span className="badge-zst">ZST</span>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-action" onClick={() => { setShowEnhancedSyncModal(false); setDecompressMode(false); }}>キャンセル</button>
              <button
                className={`btn-action ${decompressMode ? '' : 'primary'}`}
                disabled={selectedFiles.size === 0}
                onClick={decompressMode ? handleDecompress : handleExecuteEnhancedSync}
              >
                {selectedFiles.size > 0
                  ? decompressMode ? `${selectedFiles.size}件を解凍する` : `${selectedFiles.size}件を取り込み開始`
                  : decompressMode ? '解凍する' : '取り込み開始'}
              </button>
            </div>

          </div>
        </div>
      )}

      {dangerModal && (() => {
        const isStep2 = dangerModal.step === 2;
        return (
          <div className="modal-overlay" onClick={() => setDangerModal(null)}>
            <div className="modal-content danger-modal" onClick={e => e.stopPropagation()}>
              <div className="danger-modal-header">
                <div className="danger-modal-badge">
                  {isStep2 ? "⚠ FINAL WARNING" : "⚠ DANGER"}
                </div>
                <h3>
                  {dangerModal.action === "deleteToday"
                    ? "今日分の記録を削除"
                    : isStep2 ? "本当に初期化しますか？" : "データベースを完全に初期化"}
                </h3>
              </div>

              <div className="danger-modal-body">
                {dangerModal.action === "deleteToday" ? (
                  <p>今日（ローカル時刻）に記録された<strong>ワールド訪問データをすべて削除</strong>します。<br />この操作は<strong>取り消せません。</strong></p>
                ) : isStep2 ? (
                  <p>本当に実行しますか？<br />ログを再解析するまで<strong>統計・履歴・プレイヤー情報がすべて消去</strong>されます。</p>
                ) : (
                  <p>データベースの<strong>全記録を完全に消去</strong>します。<br />この操作は<strong>取り消せません。</strong>ログが再解析されるまで空になります。</p>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn-action" onClick={() => setDangerModal(null)}>キャンセル</button>
                <button className="btn-action danger-confirm" onClick={advanceDangerModal}>
                  {dangerModal.action === "deleteToday"
                    ? "削除する"
                    : isStep2 ? "完全に初期化する" : "続行する →"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <div className="toast-icon"><Icons.Sparkle /></div>
            <div className="toast-msg">{t.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
