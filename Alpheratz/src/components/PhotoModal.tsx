import { KeyboardEvent, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";
import { Icons } from "./Icons";

interface PhotoModalProps {
    photo: Photo;
    onClose: () => void;
    localMemo: string;
    setLocalMemo: (val: string) => void;
    handleSaveMemo: () => void;
    isSavingMemo: boolean;
    handleOpenWorld: () => void;
    canGoBack?: boolean;
    onGoBack?: () => void;
    onToggleFavorite: () => void;
    onAddTag: (tag: string) => void;
    onRemoveTag: (tag: string) => void;
    addToast: (msg: string) => void;
}

export const PhotoModal = ({
    photo,
    onClose,
    localMemo,
    setLocalMemo,
    handleSaveMemo,
    isSavingMemo,
    handleOpenWorld,
    canGoBack,
    onGoBack,
    onToggleFavorite,
    onAddTag,
    onRemoveTag,
    addToast,
}: PhotoModalProps) => {
    const [tagDraft, setTagDraft] = useState("");

    const submitTag = () => {
        const normalized = tagDraft.trim();
        if (!normalized) return;
        onAddTag(normalized);
        setTagDraft("");
    };

    const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitTag();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
                {canGoBack && onGoBack && (
                    <button className="modal-back photo-modal-back" onClick={onGoBack}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                )}
                <button className="modal-close" onClick={onClose} aria-label="閉じる">
                    <Icons.Close />
                </button>
                <div className="modal-body photo-modal-body">
                    <div className="modal-image-container photo-modal-image">
                        <img src={convertFileSrc(photo.photo_path)} alt="" />
                        <div className="photo-modal-filename">
                            {photo.photo_filename}
                        </div>
                    </div>
                    <div className="modal-info photo-modal-info">
                        <div className="info-header">
                            <h2
                                className={photo.world_id ? "photo-modal-title clickable" : "photo-modal-title"}
                                onClick={handleOpenWorld}
                            >
                                {photo.world_name || "ワールド不明"}{photo.world_id && " ↗"}
                            </h2>
                            <div className="info-meta photo-modal-meta">
                                <span className="timestamp">{photo.timestamp}</span>
                                {photo.world_id && <span className="timestamp">World ID: {photo.world_id}</span>}
                                {photo.match_source === "stella_db" && <span className="timestamp">STELLA DB</span>}
                                {photo.orientation && <span className="timestamp">{photo.orientation}</span>}
                            </div>
                        </div>
                        <div className="action-buttons-section">
                            <button className={`world-link-button ${photo.is_favorite ? "favorite-active" : ""}`} onClick={onToggleFavorite}>
                                {photo.is_favorite ? "★ お気に入り解除" : "☆ お気に入り追加"}
                            </button>
                            {photo.world_id && (
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
                            )}
                            <button
                                className="world-link-button world-link-button-subtle"
                                onClick={async () => {
                                    try {
                                        await invoke("show_in_explorer", { path: photo.photo_path });
                                    } catch (err) {
                                        addToast(`エクスプローラーで表示できませんでした: ${String(err)}`);
                                    }
                                }}
                            >
                                <svg className="world-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                エクスプローラーで表示
                            </button>
                        </div>

                        <div className="memo-section">
                            <label>タグ</label>
                            <div className="tag-editor">
                                <input
                                    type="text"
                                    value={tagDraft}
                                    placeholder="タグを追加"
                                    onChange={(e) => setTagDraft(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                />
                                <button className="save-button" onClick={submitTag}>追加</button>
                            </div>
                            {!!photo.tags?.length && (
                                <div className="tag-list">
                                    {photo.tags.map((tag) => (
                                        <button key={tag} className="tag-chip" onClick={() => onRemoveTag(tag)}>
                                            {tag} ×
                                        </button>
                                    ))}
                                </div>
                            )}
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
