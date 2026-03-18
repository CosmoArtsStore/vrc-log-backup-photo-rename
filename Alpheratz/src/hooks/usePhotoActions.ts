import { useState, useCallback, useEffect } from "react";
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
                photoPath: selectedPhoto.photo_path,
                memo: localMemo,
                sourceSlot: selectedPhoto.source_slot ?? 1,
            });
            setPhotos((prev) => prev.map((p) =>
                p.photo_path === selectedPhoto.photo_path ? { ...p, memo: localMemo } : p
            ));
            setSelectedPhoto((prev) => (prev ? { ...prev, memo: localMemo } : null));
            addToast("メモを保存しました。");
        } catch (err) {
            addToast(`保存に失敗しました: ${String(err)}`);
        } finally {
            setIsSavingMemo(false);
        }
    };

    const handleOpenWorld = async () => {
        if (selectedPhoto?.world_id) {
            try {
                await invoke("open_world_url", { worldId: selectedPhoto.world_id });
            } catch (err) {
                addToast(`ワールドページを開けませんでした: ${String(err)}`);
            }
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
        setLocalMemo("");
    }, []);

    const goBackPhoto = useCallback(() => {
        setPhotoHistory(prev => {
            if (prev.length > 0) {
                const newHistory = [...prev];
                const lastPhoto = newHistory.pop()!;
                setSelectedPhoto(lastPhoto);
                setLocalMemo(lastPhoto.memo ?? "");
                return newHistory;
            }
            return prev;
        });
    }, []);

    const closePhotoModal = useCallback(() => {
        setSelectedPhoto(null);
        setPhotoHistory([]);
    }, []);

    useEffect(() => {
        if (!selectedPhoto) {
            setLocalMemo("");
            return;
        }

        let isMounted = true;
        setLocalMemo(selectedPhoto.memo ?? "");

        Promise.all([
            invoke<string>("get_photo_memo_cmd", {
                photoPath: selectedPhoto.photo_path,
                sourceSlot: selectedPhoto.source_slot ?? 1,
            }),
            invoke<string[]>("get_photo_tags_cmd", {
                photoPath: selectedPhoto.photo_path,
                sourceSlot: selectedPhoto.source_slot ?? 1,
            }),
        ])
            .then(([memo, tags]) => {
                if (!isMounted) {
                    return;
                }
                setLocalMemo(memo);
                setSelectedPhoto((prev) => (prev && prev.photo_path === selectedPhoto.photo_path ? { ...prev, memo, tags } : prev));
                setPhotos((prev) => prev.map((photo) => (
                    photo.photo_path === selectedPhoto.photo_path ? { ...photo, memo, tags } : photo
                )));
            })
            .catch((err) => {
                if (isMounted) {
                    addToast(`メモの読み込みに失敗しました: ${String(err)}`);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [selectedPhoto]);

    return {
        selectedPhoto,
        setSelectedPhoto,
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
