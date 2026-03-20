import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { DisplayPhotoItem } from "../types";
import { AnimatedFavoriteStar } from "./AnimatedFavoriteStar";
import { useViewportPresence } from "../hooks/useViewportPresence";

interface GalleryPhotoCardProps {
    item: DisplayPhotoItem;
    onSelect: (item: DisplayPhotoItem) => void;
    onToggleSelect: (item: DisplayPhotoItem, shiftKey: boolean) => void;
    selected: boolean;
}

export const GalleryPhotoCard = ({
    item,
    onSelect,
    onToggleSelect,
    selected,
}: GalleryPhotoCardProps) => {
    const photo = item.photo;
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const shouldLoadThumb = useViewportPresence(cardRef, photo.photo_path, {
        rootMargin: "96px 0px",
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
                console.warn(`サムネイル生成に失敗しました [${photo.photo_path}]`, err);
                if (isMounted) {
                    setThumbUrl(null);
                }
            });
        return () => {
            isMounted = false;
        };
    }, [shouldLoadThumb, photo.photo_path, photo.source_slot]);

    return (
        <div
            ref={cardRef}
            className={`gallery-photo-card ${selected ? "selected" : ""}`}
            onClick={() => onSelect(item)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item);
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className="gallery-photo-thumb">
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
                {thumbUrl ? (
                    <img
                        src={thumbUrl}
                        alt={photo.photo_filename}
                        className="gallery-photo-image"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                    />
                ) : (
                    <div className="photo-thumb-skeleton" />
                )}
                <div className={`gallery-quick-favorite-star ${photo.is_favorite ? "active" : ""}`} aria-hidden="true">
                    <AnimatedFavoriteStar liked={photo.is_favorite} className="favorite-star-gallery" />
                </div>
                {!!item.groupCount && item.groupCount > 1 && (
                    <div className="gallery-group-count-badge" aria-hidden="true">{item.groupCount}枚</div>
                )}
                <div className="gallery-photo-overlay">
                    <div className="gallery-photo-topline">
                        <div className="photo-meta-row">
                            {photo.is_favorite && <span className="photo-pill favorite">★ Favorite</span>}
                            {photo.match_source === "stella_db" && <span className="photo-pill">DB</span>}
                            {photo.match_source === "phash" && <span className="photo-pill">類似一致</span>}
                        </div>
                    </div>
                    <div className="gallery-photo-bottomline">
                        <div className="gallery-photo-world">{photo.world_name || "ワールド不明"}</div>
                        <div className="gallery-photo-date">{photo.timestamp}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
