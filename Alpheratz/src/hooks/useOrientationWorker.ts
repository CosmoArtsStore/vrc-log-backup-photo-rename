import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

type OrientationProgress = {
    done: number;
    total: number;
    current?: string | null;
};

const EMPTY_PROGRESS: OrientationProgress = {
    done: 0,
    total: 0,
    current: null,
};

export function useOrientationWorker() {
    const [progress, setProgress] = useState<OrientationProgress>(EMPTY_PROGRESS);
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        const unlistenFns: UnlistenFn[] = [];

        const setup = async () => {
            try {
                const initial = await invoke<OrientationProgress>("get_orientation_progress_cmd");
                setProgress(initial);
                setIsRunning(initial.total > 0 && initial.done < initial.total);
            } catch {
                setProgress(EMPTY_PROGRESS);
            }

            unlistenFns.push(await listen<OrientationProgress>("orientation_progress", (event) => {
                setProgress(event.payload);
                setIsRunning(true);
            }));

            unlistenFns.push(await listen("orientation_complete", () => {
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
