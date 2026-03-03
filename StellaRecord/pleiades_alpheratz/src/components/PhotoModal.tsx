import { convertFileSrc } from "@tauri-apps/api/core";
import { Photo } from "../types";

interface PhotoModalProps {
    photo: Photo;
    onClose: () => void;
    localMemo: string;
    setLocalMemo: (val: string) => void;
    handleSaveMemo: () => void;
    isSavingMemo: boolean;
    handleOpenWorld: () => void;
}

export const PhotoModal = ({
    photo,
    onClose,
    localMemo,
    setLocalMemo,
    handleSaveMemo,
    isSavingMemo,
    handleOpenWorld,
}: PhotoModalProps) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>
                <div className="modal-body">
                    <div className="modal-image-container">
                        <img src={convertFileSrc(photo.photo_path)} alt="" />
                    </div>
                    <div className="modal-info">
                        <div className="info-header">
                            <h2 onClick={handleOpenWorld} style={{ cursor: photo.world_id ? "pointer" : "default" }}>
                                {photo.world_name || "ワールド不明"}{photo.world_id && " ↗"}
                            </h2>
                            <div className="info-meta">
                                <span className="timestamp">{photo.timestamp}</span>
                            </div>
                        </div>
                        {photo.world_id && (
                            <div className="world-link-section">
                                <button className="world-link-button" onClick={handleOpenWorld}>
                                    <svg className="world-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M2 12h20" />
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                    </svg>
                                    VRChat ワールドページを開く
                                    <svg className="world-link-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                </button>
                            </div>
                        )}
                        <div className="memo-section">
                            <label>メモ</label>
                            <textarea value={localMemo} onChange={(e) => setLocalMemo(e.target.value)} placeholder="メモを入力..." />
                            <button className="save-button" onClick={handleSaveMemo} disabled={isSavingMemo}>
                                {isSavingMemo ? "保存中..." : "メモを保存"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
