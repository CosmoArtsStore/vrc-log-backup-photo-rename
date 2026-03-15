import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";

interface GalleryPhotoCardProps {
    photo: Photo;
    onSelect: (photo: Photo) => void;
}

export const GalleryPhotoCard = ({ photo, onSelect }: GalleryPhotoCardProps) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        invoke<string>("create_thumbnail", { path: photo.photo_path })
            .then((path) => {
                if (isMounted) {
                    setThumbUrl(convertFileSrc(path));
                }
            })
            .catch(() => {
                if (isMounted) {
                    setThumbUrl(null);
                }
            });
        return () => {
            isMounted = false;
        };
    }, [photo.photo_path]);

    const orientationClass = photo.orientation === "portrait"
        ? "portrait"
        : photo.orientation === "landscape"
            ? "landscape"
            : "unknown";

    return (
        <button
            type="button"
            className={`gallery-photo-card ${orientationClass}`}
            onClick={() => onSelect(photo)}
        >
            <div className={`gallery-photo-thumb ${orientationClass}`}>
                {thumbUrl ? (
                    <img src={thumbUrl} alt={photo.photo_filename} className="gallery-photo-image" />
                ) : (
                    <div className="photo-thumb-skeleton" />
                )}
                <div className="gallery-photo-overlay">
                    <div className="gallery-photo-topline">
                        <div className="photo-meta-row">
                            {photo.is_favorite && <span className="photo-pill favorite">★ Favorite</span>}
                            {photo.match_source === "stella_db" && <span className="photo-pill">DB</span>}
                            {photo.match_source === "phash" && <span className="photo-pill">pHash</span>}
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
