import { useState, useEffect, CSSProperties, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { DisplayPhotoItem } from "../types";
import { AnimatedFavoriteStar } from "./AnimatedFavoriteStar";
import { useViewportPresence } from "../hooks/useViewportPresence";

interface PhotoCardProps {
  data: DisplayPhotoItem[];
  onSelect: (item: DisplayPhotoItem) => void;
  onToggleSelect: (item: DisplayPhotoItem, shiftKey: boolean) => void;
  isSelected: (item: DisplayPhotoItem) => boolean;
  showTags: boolean;
  columnCount: number;
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
}

export const PhotoCard = ({
  data, onSelect, onToggleSelect, isSelected, showTags, columnCount, columnIndex, rowIndex, style,
}: PhotoCardProps) => {
  const index = rowIndex * columnCount + columnIndex;
  const item = data[index];
  const photo = item?.photo;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const shouldLoadThumb = useViewportPresence(cardRef, photo?.photo_path, {
    rootMargin: "64px 0px",
    releaseDelayMs: 180,
  });

  useEffect(() => {
    if (!photo) return;
    if (!shouldLoadThumb) {
      setThumbUrl(null);
      return;
    }
    let isMounted = true;
    invoke<string>("create_grid_thumbnail", { path: photo.photo_path, sourceSlot: photo.source_slot ?? 1 })
      .then((path) => { if (isMounted) setThumbUrl(convertFileSrc(path)); })
      .catch((err) => {
        console.warn(`サムネイル生成に失敗しました [${photo.photo_path}]`, err);
        if (isMounted) setThumbUrl(null);
      });
    return () => {
      isMounted = false;
      setThumbUrl(null);
    };
  }, [photo?.photo_path, photo?.source_slot, shouldLoadThumb]);

  if (!photo) return null;

  const selected = isSelected(item);

  return (
    <div ref={cardRef} style={style} className="photo-card-wrapper" onClick={() => onSelect(item)}>
      <div className={`photo-card ${selected ? "selected" : ""}`}>
        <div className="photo-thumb-container">
          <button
            className={`photo-select-toggle ${selected ? "selected" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(item, event.shiftKey);
            }}
            aria-label={selected ? "選択解除" : "選択"}
            type="button"
          >
            {selected ? "✓" : ""}
          </button>
          {thumbUrl
            ? <img src={thumbUrl} alt={photo.photo_filename} className="photo-thumb" loading="lazy" decoding="async" draggable={false} />
            : <div className="photo-thumb-skeleton" />
          }
          {photo.is_favorite && (
            <span className="photo-favorite-corner" aria-hidden="true">
              <AnimatedFavoriteStar liked={true} className="favorite-star-corner" />
            </span>
          )}
          {!!item.groupCount && item.groupCount > 1 && (
            <span className="photo-group-count-badge" aria-hidden="true">
              {item.groupCount}枚
            </span>
          )}
          <span className={`photo-source-badge slot-${photo.source_slot === 2 ? "2" : "1"}`}>
            {photo.source_slot === 2 ? "2nd" : "1st"}
          </span>
        </div>
        <div className="photo-info">
          <div className="photo-meta-row">
            {photo.match_source === "stella_db" && <span className="photo-pill">DB</span>}
            {photo.match_source === "phash" && <span className="photo-pill">類似一致</span>}
            {photo.orientation && (
              <span className="photo-pill">{photo.orientation}</span>
            )}
          </div>
          <div className="photo-world">{photo.world_name || "ワールド不明"}</div>
          <div className="photo-date">{photo.timestamp}</div>
          {showTags && !!photo.tags?.length && (
            <div className="photo-tags-preview">
              {photo.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="photo-tag-chip">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
