import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";

export const usePhotoActions = (setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>, addToast: (msg: string) => void) => {
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [localMemo, setLocalMemo] = useState("");
    const [isSavingMemo, setIsSavingMemo] = useState(false);

    const handleSaveMemo = async () => {
        if (!selectedPhoto) return;
        setIsSavingMemo(true);
        try {
            await invoke("save_photo_memo", {
                filename: selectedPhoto.photo_filename,
                memo: localMemo
            });
            setPhotos((prev) => prev.map((p) =>
                p.photo_filename === selectedPhoto.photo_filename ? { ...p, memo: localMemo } : p
            ));
            setSelectedPhoto((prev) => (prev ? { ...prev, memo: localMemo } : null));
            addToast("メモを保存しました。");
        } catch {
            addToast("保存に失敗しました。");
        } finally {
            setIsSavingMemo(false);
        }
    };

    const handleOpenWorld = async () => {
        if (selectedPhoto?.world_id) {
            await invoke("open_world_url", { worldId: selectedPhoto.world_id });
        }
    };

    const onSelectPhoto = useCallback((photo: Photo) => {
        setSelectedPhoto(photo);
        setLocalMemo(photo.memo);
    }, []);

    return {
        selectedPhoto,
        setSelectedPhoto,
        localMemo,
        setLocalMemo,
        isSavingMemo,
        handleSaveMemo,
        handleOpenWorld,
        onSelectPhoto,
    };
};
