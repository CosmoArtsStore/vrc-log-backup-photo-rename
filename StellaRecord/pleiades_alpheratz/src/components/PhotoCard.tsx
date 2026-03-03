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
            .catch((err) => console.error("Thumbnail error:", err));
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
                    <div className="photo-world">{photo.world_name || "ワールド不明"}</div>
                    <div className="photo-date">{photo.timestamp}</div>
                </div>
            </div>
        </div>
    );
};
