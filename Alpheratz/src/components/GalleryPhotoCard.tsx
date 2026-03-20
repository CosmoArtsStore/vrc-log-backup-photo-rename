import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { DisplayPhotoItem } from "../types";
import { AnimatedFavoriteStar } from "./AnimatedFavoriteStar";

interface GalleryPhotoCardProps {
    item: DisplayPhotoItem;
    onSelect: (item: DisplayPhotoItem) => void;
    showQuickFavoriteStar?: boolean;
}

export const GalleryPhotoCard = ({
    item,
    onSelect,
    showQuickFavoriteStar = false,
}: GalleryPhotoCardProps) => {
    const photo = item.photo;
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [shouldLoadThumb, setShouldLoadThumb] = useState(false);
    const cardRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        const node = cardRef.current;
        if (!node) {
            return;
        }

        if (!("IntersectionObserver" in window)) {
            setShouldLoadThumb(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const isNearViewport = entries.some((entry) => entry.isIntersecting);
                setShouldLoadThumb(isNearViewport);
            },
            {
                rootMargin: "120px 0px",
                threshold: 0.01,
            },
        );

        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [photo.photo_path]);

    useEffect(() => {
        if (!shouldLoadThumb) {
            setThumbUrl(null);
            return;
        }
        let isMounted = true;
        invoke<string>("create_display_thumbnail", { path: photo.photo_path, sourceSlot: photo.source_slot ?? 1 })
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

    const orientationClass = photo.orientation === "portrait"
        ? "portrait"
        : photo.orientation === "landscape"
            ? "landscape"
            : "unknown";

    const frameRatio = (() => {
        if (photo.orientation === "portrait") {
            return "9 / 16";
        }
        if (photo.orientation === "landscape") {
            return "16 / 9";
        }
        return "1 / 1";
    })();

    return (
        <button
            ref={cardRef}
            type="button"
            className={`gallery-photo-card ${orientationClass}`}
            onClick={() => onSelect(item)}
        >
            <div
                className={`gallery-photo-thumb ${orientationClass}`}
                style={{ aspectRatio: frameRatio }}
            >
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
                {showQuickFavoriteStar && (
                    <div className={`gallery-quick-favorite-star ${photo.is_favorite ? "active" : ""}`} aria-hidden="true">
                        <AnimatedFavoriteStar liked={photo.is_favorite} className="favorite-star-gallery" />
                    </div>
                )}
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
        </button>
    );
};
