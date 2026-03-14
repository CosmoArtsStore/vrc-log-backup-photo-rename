import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Photo } from "../types";
import { ToastType } from "./useToasts";

export const usePhotos = (
    searchQuery: string,
    worldFilter: string,
    addToast?: (msg: string, type?: ToastType) => void,
) => {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadPhotos = useCallback(async () => {
        setIsLoading(true);
        try {
            const results = await invoke<Photo[]>("get_photos", {
                worldQuery: searchQuery || null,
                worldExact: worldFilter === "all" ? null : worldFilter,
            });
            setPhotos(results);
        } catch (err) {
            addToast?.(`写真一覧の読み込みに失敗しました: ${String(err)}`, "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, searchQuery, worldFilter]);

    useEffect(() => {
        setIsLoading(true);
        loadPhotos();

        const unlistens = [
            listen("scan:completed", () => {
                loadPhotos();
            }),
            listen("scan:enrich_completed", () => {
                loadPhotos();
            }),
        ];

        return () => {
            unlistens.forEach((promise) => {
                promise.then((u: UnlistenFn) => u());
            });
        };
    }, [loadPhotos]);

    return { photos, setPhotos, loadPhotos, isLoading };
};
