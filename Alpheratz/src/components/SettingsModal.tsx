interface SettingsModalProps {
    onClose: () => void;
    photoFolderPath: string;
    handleChooseFolder: () => void;
    startupEnabled: boolean;
    onToggleStartup: () => void;
    themeMode: "light" | "dark";
    onToggleTheme: () => void;
}

export const SettingsModal = ({
    onClose,
    photoFolderPath,
    handleChooseFolder,
    startupEnabled,
    onToggleStartup,
    themeMode,
    onToggleTheme,
}: SettingsModalProps) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content settings-panel" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} aria-label="閉じる">×</button>
                <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="modal-info">
                        <div className="info-header"><h2>設定</h2></div>
                        <div className="memo-section">
                            <label>VRChat写真フォルダ</label>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <input
                                    type="text"
                                    value={photoFolderPath}
                                    readOnly
                                    style={{ flex: 1, padding: "0.8rem", borderRadius: "12px", border: "1px solid var(--a-border)", background: "rgba(0,0,0,0.03)", fontFamily: "var(--a-font-mono)", fontSize: "0.82rem" }}
                                />
                                <button className="save-button" onClick={handleChooseFolder} style={{ width: "100px" }}>変更</button>
                            </div>
                        </div>
                        <div className="memo-section">
                            <label>ログイン時に起動</label>
                            <div className="settings-toggle-row">
                                <p className="startup-toggle-text">
                                    Windows ログイン時に Alpheratz を自動で起動します。
                                </p>
                                <button
                                    className={`toggle-switch ${startupEnabled ? "active" : ""}`}
                                    onClick={onToggleStartup}
                                    aria-label="ログイン時起動を切り替え"
                                >
                                    <span className="toggle-switch-knob" />
                                </button>
                            </div>
                        </div>
                        <div className="memo-section">
                            <label>表示テーマ</label>
                            <div className="settings-toggle-row">
                                <p className="startup-toggle-text">
                                    ベース色をダークグレーへ切り替え、文字色を白基調にします。
                                </p>
                                <button
                                    className={`toggle-switch ${themeMode === "dark" ? "active" : ""}`}
                                    onClick={onToggleTheme}
                                    aria-label="ダークモードを切り替え"
                                >
                                    <span className="toggle-switch-knob" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
