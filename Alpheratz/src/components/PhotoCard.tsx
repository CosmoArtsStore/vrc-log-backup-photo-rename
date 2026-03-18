import { useState, useEffect, CSSProperties } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { DisplayPhotoItem } from "../types";
import { AnimatedFavoriteStar } from "./AnimatedFavoriteStar";

interface PhotoCardProps {
  data: DisplayPhotoItem[];
  onSelect: (item: DisplayPhotoItem) => void;
  columnCount: number;
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
}

export const PhotoCard = ({
  data, onSelect, columnCount, columnIndex, rowIndex, style,
}: PhotoCardProps) => {
  const index = rowIndex * columnCount + columnIndex;
  const item = data[index];
  const photo = item?.photo;
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    let isMounted = true;
    invoke<string>("create_thumbnail", { path: photo.photo_path, sourceSlot: photo.source_slot ?? 1 })
      .then((path) => { if (isMounted) setThumbUrl(convertFileSrc(path)); })
      .catch(() => { if (isMounted) setThumbUrl(null); });
    return () => { isMounted = false; };
  }, [photo?.photo_path, photo?.source_slot]);

  if (!photo) return null;

  return (
    <div style={style} className="photo-card-wrapper" onClick={() => onSelect(item)}>
      <div className="photo-card">
        <div className="photo-thumb-container">
          {thumbUrl
            ? <img src={thumbUrl} alt={photo.photo_filename} className="photo-thumb" />
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
            {photo.match_source === "phash" && <span className="photo-pill">pHash</span>}
            {photo.orientation && (
              <span className="photo-pill">{photo.orientation}</span>
            )}
          </div>
          <div className="photo-world">{photo.world_name || "ワールド不明"}</div>
          <div className="photo-date">{photo.timestamp}</div>
          {!!photo.tags?.length && (
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
