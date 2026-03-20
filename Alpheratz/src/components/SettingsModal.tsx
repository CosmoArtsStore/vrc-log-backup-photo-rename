import { KeyboardEvent, useState } from "react";

interface SettingsModalProps {
  onClose: () => void;
  photoFolderPath: string;
  secondaryPhotoFolderPath: string;
  handleChooseFolder: (slot: 1 | 2) => void;
  startupEnabled: boolean;
  onToggleStartup: () => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  masterTags: string[];
  onCreateTagMaster: (tag: string) => void;
  onDeleteTagMaster: (tag: string) => void;
}

export const SettingsModal = ({
  onClose,
  photoFolderPath,
  secondaryPhotoFolderPath,
  handleChooseFolder,
  startupEnabled,
  onToggleStartup,
  themeMode,
  onToggleTheme,
  masterTags,
  onCreateTagMaster,
  onDeleteTagMaster,
}: SettingsModalProps) => {
  const [tagDraft, setTagDraft] = useState("");

  const submitTagMaster = () => {
    const normalized = tagDraft.trim();
    if (!normalized) {
      return;
    }
    onCreateTagMaster(normalized);
    setTagDraft("");
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitTagMaster();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-panel settings-panel-wide" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="閉じる" type="button">
          ×
        </button>
        <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
          <div className="modal-info">
            <div className="info-header">
              <h2>設定</h2>
            </div>

            <div className="settings-section-grid">
              <div className="memo-section">
                <label>写真フォルダ 1st</label>
                <div className="settings-path-row">
                  <input className="settings-path-input" type="text" value={photoFolderPath} readOnly />
                  <button className="save-button settings-action-button" onClick={() => handleChooseFolder(1)} type="button">
                    変更
                  </button>
                </div>
              </div>

              <div className="memo-section">
                <label>写真フォルダ 2nd</label>
                <div className="settings-path-row">
                  <input className="settings-path-input" type="text" value={secondaryPhotoFolderPath} readOnly />
                  <button className="save-button settings-action-button" onClick={() => handleChooseFolder(2)} type="button">
                    変更
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section-grid">
              <div className="memo-section">
                <label>ログイン時に起動</label>
                <div className="settings-toggle-row">
                  <p className="startup-toggle-text">
                    Windows ログイン時に Alpheratz を自動起動します。
                  </p>
                  <button
                    className={`toggle-switch ${startupEnabled ? "active" : ""}`}
                    onClick={onToggleStartup}
                    aria-label="ログイン時起動を切り替える"
                    type="button"
                  >
                    <span className="toggle-switch-knob" />
                  </button>
                </div>
              </div>

              <div className="memo-section">
                <label>表示テーマ</label>
                <div className="settings-toggle-row">
                  <p className="startup-toggle-text">
                    ベース配色をダークテーマへ切り替えます。再起動は不要です。
                  </p>
                  <button
                    className={`toggle-switch ${themeMode === "dark" ? "active" : ""}`}
                    onClick={onToggleTheme}
                    aria-label="ダークテーマを切り替える"
                    type="button"
                  >
                    <span className="toggle-switch-knob" />
                  </button>
                </div>
              </div>
            </div>

            <div className="memo-section">
              <label>タグマスタ</label>
              <div className="tag-master-editor">
                <input
                  type="text"
                  value={tagDraft}
                  placeholder="タグを追加"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
                <button className="save-button" onClick={submitTagMaster} type="button">
                  追加
                </button>
              </div>
              <div className="tag-master-list">
                {masterTags.length === 0 ? (
                  <div className="tag-master-empty">タグマスタはまだありません。</div>
                ) : (
                  masterTags.map((tag) => (
                    <div key={tag} className="tag-master-item">
                      <span className="tag-master-name">{tag}</span>
                      <button
                        className="tag-master-remove"
                        onClick={() => onDeleteTagMaster(tag)}
                        aria-label={`${tag} を削除`}
                        type="button"
                      >
                        削除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
