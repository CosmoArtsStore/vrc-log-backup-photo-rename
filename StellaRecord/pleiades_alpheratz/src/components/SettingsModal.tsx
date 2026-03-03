

interface SettingsModalProps {
    onClose: () => void;
    photoFolderPath: string;
    handleChooseFolder: () => void;
}

export const SettingsModal = ({
    onClose,
    photoFolderPath,
    handleChooseFolder,
}: SettingsModalProps) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content settings-panel" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>
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
                    </div>
                </div>
            </div>
        </div>
    );
};
