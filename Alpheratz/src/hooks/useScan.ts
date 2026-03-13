import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScanProgress } from "../types";
import { ToastType } from "./useToasts";

export const useScan = (addToast?: (msg: string, type?: ToastType) => void) => {
    const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "completed" | "error">("idle");
    const [scanProgress, setScanProgress] = useState<ScanProgress>({ processed: 0, total: 0, current_world: "" });
    const [photoFolderPath, setPhotoFolderPath] = useState("");

    const startScan = useCallback(async () => {
        if (scanStatus === "scanning") return; // 多重起動防止
        setScanStatus("scanning");
        setScanProgress({ processed: 0, total: 0, current_world: "" });
        try {
            await invoke("initialize_scan");
        } catch (err) {
            setScanStatus("error");
            console.error("Scan error:", err);
            addToast?.("スキャンの開始に失敗しました", "error");
        }
    }, [scanStatus, addToast]);

    const refreshSettings = useCallback(async () => {
        const setting = await invoke<any>("get_setting_cmd");
        setPhotoFolderPath(setting.photoFolderPath || "");
    }, []);

    useEffect(() => {
        const unlistens: Promise<() => void>[] = [];

        // 1. レースコンディションを避けるため、リスナーを先に登録
        unlistens.push(listen<ScanProgress>("scan:progress", (e) => setScanProgress(e.payload)));
        unlistens.push(listen("scan:completed", () => {
            console.log("Scan completed received");
            setScanStatus("completed");
        }));
        unlistens.push(listen("scan:error", () => {
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
    }, [startScan, refreshSettings, addToast]);

    const cancelScan = useCallback(async () => {
        try {
            await invoke("cancel_scan");
        } catch (err) {
            console.error("Cancel failed:", err);
        }
    }, []);

    return { scanStatus, scanProgress, photoFolderPath, startScan, refreshSettings, cancelScan };
};
