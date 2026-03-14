import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Photo } from "../types";

export const usePhotoActions = (setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>, addToast: (msg: string) => void) => {
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [photoHistory, setPhotoHistory] = useState<Photo[]>([]);
    const [localMemo, setLocalMemo] = useState("");
    const [isSavingMemo, setIsSavingMemo] = useState(false);

    const handleSaveMemo = async () => {
        if (!selectedPhoto) return;
        setIsSavingMemo(true);
        try {
            await invoke("save_photo_memo_cmd", {
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

    const onSelectPhoto = useCallback((photo: Photo, isSimilarSearch = false) => {
        setSelectedPhoto(prev => {
            if (prev && isSimilarSearch) {
                setPhotoHistory(h => [...h, prev]);
            } else if (!isSimilarSearch) {
                setPhotoHistory([]);
            }
            return photo;
        });
        setLocalMemo(photo.memo);
    }, []);

    const goBackPhoto = useCallback(() => {
        setPhotoHistory(prev => {
            if (prev.length > 0) {
                const newHistory = [...prev];
                const lastPhoto = newHistory.pop()!;
                setSelectedPhoto(lastPhoto);
                setLocalMemo(lastPhoto.memo);
                return newHistory;
            }
            return prev;
        });
    }, []);

    const closePhotoModal = useCallback(() => {
        setSelectedPhoto(null);
        setPhotoHistory([]);
    }, []);

    return {
        selectedPhoto,
        closePhotoModal,
        photoHistory,
        goBackPhoto,
        localMemo,
        setLocalMemo,
        isSavingMemo,
        handleSaveMemo,
        handleOpenWorld,
        onSelectPhoto,
    };
};
