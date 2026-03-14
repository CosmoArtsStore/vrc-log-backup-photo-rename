import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScanProgress } from "../types";
import { ToastType } from "./useToasts";

export const useScan = (addToast?: (msg: string, type?: ToastType) => void) => {
    const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "completed" | "error">("idle");
    const [scanProgress, setScanProgress] = useState<ScanProgress>({ processed: 0, total: 0, current_world: "", phase: "scan" });
    const [isEnriching, setIsEnriching] = useState(false);
    const [enrichProgress, setEnrichProgress] = useState<ScanProgress>({ processed: 0, total: 0, current_world: "", phase: "enrich" });
    const [photoFolderPath, setPhotoFolderPath] = useState("");
    const isScanningRef = useRef(false);

    const startScan = useCallback(async () => {
        if (isScanningRef.current) return;
        isScanningRef.current = true;
        setScanStatus("scanning");
        setScanProgress({ processed: 0, total: 0, current_world: "", phase: "scan" });
        setIsEnriching(false);
        setEnrichProgress({ processed: 0, total: 0, current_world: "", phase: "enrich" });
        try {
            await invoke("initialize_scan");
        } catch (err) {
            isScanningRef.current = false;
            setScanStatus("error");
            console.error("Scan error:", err);
            addToast?.("スキャンの開始に失敗しました", "error");
        }
    }, [addToast]);

    const refreshSettings = useCallback(async () => {
        const setting = await invoke<any>("get_setting_cmd");
        setPhotoFolderPath(setting.photoFolderPath || "");
    }, []);

    useEffect(() => {
        const unlistens: Promise<() => void>[] = [];

        // 1. レースコンディションを避けるため、リスナーを先に登録
        unlistens.push(listen<ScanProgress>("scan:progress", (e) => setScanProgress(e.payload)));
        unlistens.push(listen<number>("scan:enrich_start", (e) => {
            setIsEnriching(true);
            setEnrichProgress({
                processed: 0,
                total: e.payload,
                current_world: "補足情報を更新しています",
                phase: "enrich",
            });
        }));
        unlistens.push(listen<ScanProgress>("scan:enrich_progress", (e) => {
            setIsEnriching(true);
            setEnrichProgress(e.payload);
        }));
        unlistens.push(listen("scan:enrich_completed", () => {
            setIsEnriching(false);
            setEnrichProgress((prev) => ({ ...prev, processed: prev.total }));
        }));
        unlistens.push(listen("scan:completed", () => {
            isScanningRef.current = false;
            console.log("Scan completed received");
            setScanStatus("completed");
        }));
        unlistens.push(listen("scan:error", () => {
            isScanningRef.current = false;
            setScanStatus("error");
            addToast?.("スキャンに失敗しました", "error");
        }));

        const init = async () => {
            await refreshSettings();
            await startScan();
        };
        init();

        return () => {
            console.log("Cleanup unlistening");
            unlistens.forEach(p => p.then(u => u()));
        };
    }, []);

    const cancelScan = useCallback(async () => {
        try {
            await invoke("cancel_scan");
        } catch (err) {
            console.error("Cancel failed:", err);
        }
    }, []);

    return {
        scanStatus,
        scanProgress,
        isEnriching,
        enrichProgress,
        photoFolderPath,
        startScan,
        refreshSettings,
        cancelScan,
    };
};
