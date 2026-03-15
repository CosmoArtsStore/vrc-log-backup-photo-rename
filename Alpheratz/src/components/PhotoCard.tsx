import { useState, useEffect, CSSProperties } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Photo } from "../types";

interface PhotoCardProps {
    data: Photo[];
    onSelect: (photo: Photo) => void;
    columnCount: number;
    columnIndex: number;
    rowIndex: number;
    style: CSSProperties;
}

export const PhotoCard = ({
    data, onSelect, columnCount, columnIndex, rowIndex, style,
}: PhotoCardProps) => {
    const index = rowIndex * columnCount + columnIndex;
    const photo = data[index];
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!photo) return;
        let isMounted = true;
        invoke<string>("create_thumbnail", { path: photo.photo_path })
            .then((path) => { if (isMounted) setThumbUrl(convertFileSrc(path)); })
            .catch(() => { if (isMounted) setThumbUrl(null); });
        return () => { isMounted = false; };
    }, [photo?.photo_path]);

    if (!photo) return null;

    return (
        <div style={style} className="photo-card-wrapper" onClick={() => onSelect(photo)}>
            <div className="photo-card">
                <div className="photo-thumb-container">
                    {thumbUrl
                        ? <img src={thumbUrl} alt={photo.photo_filename} className="photo-thumb" />
                        : <div className="photo-thumb-skeleton" />
                    }
                </div>
                <div className="photo-info">
                    <div className="photo-meta-row">
                        {photo.is_favorite && <span className="photo-pill favorite">★ Favorite</span>}
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
