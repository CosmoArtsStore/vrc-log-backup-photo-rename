import { useEffect, useRef, useState, type WheelEvent } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";
import { Icons } from "./Icons";
import { AnimatedFavoriteStar } from "./AnimatedFavoriteStar";
import { HoverTooltip } from "./HoverTooltip";
import { useViewportPresence } from "../hooks/useViewportPresence";

interface PhotoModalProps {
  photo: Photo;
  allTags: string[];
  onClose: () => void;
  localMemo: string;
  setLocalMemo: (val: string) => void;
  handleSaveMemo: () => void;
  isSavingMemo: boolean;
  handleOpenWorld: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  onGoPrev?: () => void;
  onGoNext?: () => void;
  similarPhotos?: Photo[];
  showSimilarPhotos?: boolean;
  onSelectSimilarPhoto?: (photo: Photo) => void;
  onToggleFavorite: () => void;
  onTweet: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  addToast: (msg: string) => void;
}

const SimilarPhotoThumb = ({
  photo,
  isActive,
  onSelect,
}: {
  photo: Photo;
  isActive: boolean;
  onSelect: (photo: Photo) => void;
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shouldLoadThumb = useViewportPresence(buttonRef, photo.photo_path, {
    rootMargin: "40px 0px",
    releaseDelayMs: 180,
  });

  useEffect(() => {
    if (!shouldLoadThumb) {
      setThumbUrl(null);
      return;
    }

    let isMounted = true;
    invoke<string>("create_grid_thumbnail", { path: photo.photo_path, sourceSlot: photo.source_slot ?? 1 })
      .then((path) => {
        if (isMounted) {
          setThumbUrl(convertFileSrc(path));
        }
      })
      .catch((err) => {
        console.warn(`類似写真サムネイルの生成に失敗しました [${photo.photo_path}]`, err);
        if (isMounted) {
          setThumbUrl(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [shouldLoadThumb, photo.photo_path, photo.source_slot]);

  return (
    <button
      ref={buttonRef}
      className={`similar-photo-thumb ${isActive ? "active" : ""}`}
      onClick={() => onSelect(photo)}
      type="button"
      title={photo.photo_filename}
    >
      {thumbUrl ? <img src={thumbUrl} alt={photo.photo_filename} loading="lazy" decoding="async" draggable={false} /> : <span className="similar-photo-thumb-skeleton" />}
    </button>
  );
};

export const PhotoModal = ({
  photo,
  allTags,
  onClose,
  localMemo,
  setLocalMemo,
  handleSaveMemo,
  isSavingMemo,
  handleOpenWorld,
  canGoBack,
  onGoBack,
  canGoPrev,
  canGoNext,
  onGoPrev,
  onGoNext,
  similarPhotos = [],
  showSimilarPhotos = false,
  onSelectSimilarPhoto,
  onToggleFavorite,
  onTweet,
  onAddTag,
  onRemoveTag,
  addToast,
}: PhotoModalProps) => {
  const [selectedExistingTag, setSelectedExistingTag] = useState("");
  const similarStripRef = useRef<HTMLDivElement | null>(null);

  const availableTags = allTags.filter((tag) => !photo.tags.includes(tag));
  const hasAvailableTags = availableTags.length > 0;
  const isDbMatched = photo.match_source === "stella_db";
  const isPhashMatched = photo.match_source === "phash";

  const handleShowInExplorer = async () => {
    try {
      await invoke("show_in_explorer", { path: photo.photo_path });
    } catch (err) {
      addToast(`エクスプローラーで表示できませんでした: ${String(err)}`);
    }
  };

  const addExistingTag = () => {
    if (!selectedExistingTag) {
      return;
    }
    onAddTag(selectedExistingTag);
    setSelectedExistingTag("");
  };

  useEffect(() => {
    setSelectedExistingTag("");
  }, [photo.photo_path]);

  const handleSimilarStripWheel = (event: WheelEvent<HTMLDivElement>) => {
    const strip = similarStripRef.current;
    if (!strip) {
      return;
    }

    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    strip.scrollLeft += delta;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content photo-modal" onClick={(event) => event.stopPropagation()}>
        {canGoBack && onGoBack && (
          <button className="modal-back photo-modal-back" onClick={onGoBack} type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <button className="modal-close" onClick={onClose} aria-label="閉じる" type="button">
          <Icons.Close />
        </button>
        <div className="modal-body photo-modal-body">
          <div className="modal-image-container photo-modal-image">
            <button
              className="photo-edge-button photo-edge-button-prev"
              onClick={onGoPrev}
              disabled={!canGoPrev}
              aria-label="前の写真"
              type="button"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              className="photo-edge-button photo-edge-button-next"
              onClick={onGoNext}
              disabled={!canGoNext}
              aria-label="次の写真"
              type="button"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <img src={convertFileSrc(photo.photo_path)} alt="" />
            {showSimilarPhotos && similarPhotos.length > 1 && onSelectSimilarPhoto && (
              <div className="similar-photos-hover-zone">
                <div className="similar-photos-hover-hint">
                  類似写真 {similarPhotos.length}枚
                </div>
                <div
                  ref={similarStripRef}
                  className="similar-photos-hover-strip"
                  onWheel={handleSimilarStripWheel}
                >
                  {similarPhotos.map((item) => (
                    <SimilarPhotoThumb
                      key={item.photo_path}
                      photo={item}
                      isActive={item.photo_path === photo.photo_path}
                      onSelect={onSelectSimilarPhoto}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="photo-modal-filename">{photo.photo_filename}</div>
          </div>

          <div className="modal-info photo-modal-info">
            <div className="info-header photo-modal-header">
              <h2 className="photo-modal-title">{photo.world_name || "ワールド不明"}</h2>
              <div className="photo-modal-meta">
                <div className="photo-meta-badges">
                  <span className={`photo-meta-badge ${isDbMatched ? "active db" : ""}`}>STELLA DB</span>
                  <span className={`photo-meta-badge ${isPhashMatched ? "active phash" : ""}`}>類似一致</span>
                </div>
              </div>
            </div>

            <div className="photo-modal-divider" />

            <div className="memo-section photo-modal-form">
              <label>タグ</label>
              <div className="tag-select-row">
                <div className="tag-select-wrap">
                  <select
                    className="tag-select"
                    value={selectedExistingTag}
                    disabled={!hasAvailableTags}
                    onChange={(event) => setSelectedExistingTag(event.target.value)}
                  >
                    <option value="">
                      {hasAvailableTags ? "タグを選択..." : "追加できるタグがありません"}
                    </option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="save-button"
                  onClick={addExistingTag}
                  disabled={!selectedExistingTag || !hasAvailableTags}
                  type="button"
                >
                  追加
                </button>
              </div>
              {!hasAvailableTags && (
                <div className="tag-select-empty-note">
                  追加できるタグがありません。設定画面でタグを追加してください。
                </div>
              )}

              {!!photo.tags.length && (
                <div className="tag-list photo-modal-tag-list">
                  {photo.tags.map((tag) => (
                    <button key={tag} className="tag-chip" onClick={() => onRemoveTag(tag)} type="button">
                      {tag} ×
                    </button>
                  ))}
                </div>
              )}

              <label>メモ</label>
              <textarea
                value={localMemo}
                onChange={(event) => setLocalMemo(event.target.value)}
                placeholder="メモを入力..."
              />
              <button className="save-button" onClick={handleSaveMemo} disabled={isSavingMemo} type="button">
                {isSavingMemo ? "保存中..." : "メモを保存"}
              </button>
            </div>

            <div className="photo-modal-bottom-actions photo-modal-bottom-actions-four">
              <HoverTooltip label={photo.is_favorite ? "お気に入りから解除" : "お気に入りに追加"}>
                <button
                  className={`photo-modal-bottom-action photo-modal-bottom-action-favorite ${photo.is_favorite ? "favorite-active" : ""}`}
                  onClick={onToggleFavorite}
                  aria-label={photo.is_favorite ? "お気に入りから解除" : "お気に入りに追加"}
                  type="button"
                >
                  <AnimatedFavoriteStar liked={photo.is_favorite} className="favorite-star-modal" />
                </button>
              </HoverTooltip>
              <HoverTooltip label="ツイート投稿画面を開く">
                <button
                  className="photo-modal-bottom-action photo-modal-bottom-action-tweet"
                  onClick={onTweet}
                  aria-label="ツイート投稿画面を開く"
                  type="button"
                >
                  <Icons.Quill />
                </button>
              </HoverTooltip>
              <HoverTooltip label={photo.world_id ? "ワールドリンクを開く" : "ワールドIDがありません"}>
                <button
                  className="photo-modal-bottom-action photo-modal-bottom-action-world"
                  onClick={handleOpenWorld}
                  disabled={!photo.world_id}
                  aria-label="ワールドリンクを開く"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a14 14 0 0 1 0 18" />
                    <path d="M12 3a14 14 0 0 0 0 18" />
                  </svg>
                </button>
              </HoverTooltip>
              <HoverTooltip label="エクスプローラーで表示">
                <button
                  className="photo-modal-bottom-action photo-modal-bottom-action-explorer"
                  onClick={() => void handleShowInExplorer()}
                  aria-label="エクスプローラーで表示"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l1.7 2H18.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
                  </svg>
                </button>
              </HoverTooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
