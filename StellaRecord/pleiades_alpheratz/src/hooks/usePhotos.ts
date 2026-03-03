import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Photo } from "../types";

export const usePhotos = (searchQuery: string, worldFilter: string) => {
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
            console.error("Failed to load photos:", err);
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, worldFilter]);

    useEffect(() => {
        setIsLoading(true);
        loadPhotos();

        const unlisten = listen("scan:completed", () => {
            loadPhotos();
        });

        return () => {
            unlisten.then((u: UnlistenFn) => u());
        };
    }, [loadPhotos]);

    return { photos, setPhotos, loadPhotos, isLoading };
};
