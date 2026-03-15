import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

type PhashProgress = {
    done: number;
    total: number;
    current?: string | null;
};

const EMPTY_PROGRESS: PhashProgress = {
    done: 0,
    total: 0,
    current: null,
};

export function usePhashWorker() {
    const [progress, setProgress] = useState<PhashProgress>(EMPTY_PROGRESS);
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        const unlistenFns: UnlistenFn[] = [];

        const setup = async () => {
            try {
                const initial = await invoke<PhashProgress>("get_phash_progress_cmd");
                setProgress(initial);
                setIsRunning(initial.total > 0 && initial.done < initial.total);
            } catch {
                setProgress(EMPTY_PROGRESS);
            }

            unlistenFns.push(await listen<PhashProgress>("phash_progress", (event) => {
                setProgress(event.payload);
                setIsRunning(true);
            }));

            unlistenFns.push(await listen("phash_complete", () => {
                setIsRunning(false);
                setProgress((prev) => ({
                    ...prev,
                    done: prev.total,
                    current: null,
                }));
            }));
        };

        setup();

        return () => {
            unlistenFns.forEach((unlisten) => unlisten());
        };
    }, []);

    return { progress, isRunning };
}
