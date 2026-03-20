import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Photo } from "../types";
import { ToastType } from "./useToasts";

type PhotoQueryFilters = {
    searchQuery: string;
    worldFilters: string[];
    dateFrom: string;
    dateTo: string;
    orientationFilter: string;
    favoritesOnly: boolean;
    tagFilters: string[];
    includePhash?: boolean;
};

export const usePhotos = (
    filters: PhotoQueryFilters,
    addToast?: (msg: string, type?: ToastType) => void,
) => {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadPhotos = useCallback(async () => {
        setIsLoading(true);
        try {
            const results = await invoke<Photo[]>("get_photos", {
                startDate: filters.dateFrom || null,
                endDate: filters.dateTo || null,
                worldQuery: filters.searchQuery.trim() || null,
                worldExact: filters.worldFilters.length === 1 ? filters.worldFilters[0] : null,
                orientation: filters.orientationFilter === "all" ? null : filters.orientationFilter,
                favoritesOnly: filters.favoritesOnly || null,
                tagFilters: filters.tagFilters.length > 0 ? filters.tagFilters : null,
                includePhash: !!filters.includePhash,
            });
            setPhotos(results);
        } catch (err) {
            addToast?.(`写真一覧の読み込みに失敗しました: ${String(err)}`, "error");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, filters]);

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
            listen("phash_complete", () => {
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
