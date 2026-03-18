import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ScanProgress } from "../types";
import { ToastType } from "./useToasts";

export const useScan = (addToast?: (msg: string, type?: ToastType) => void) => {
    const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "completed" | "error">("idle");
    const [scanProgress, setScanProgress] = useState<ScanProgress>({ processed: 0, total: 0, current_world: "", phase: "scan" });
    const [photoFolderPath, setPhotoFolderPath] = useState("");
    const [secondaryPhotoFolderPath, setSecondaryPhotoFolderPath] = useState("");
    const isScanningRef = useRef(false);

    const startScan = useCallback(async () => {
        if (isScanningRef.current) return;
        isScanningRef.current = true;
        setScanStatus("scanning");
        setScanProgress({ processed: 0, total: 0, current_world: "", phase: "scan" });
        try {
            await invoke("initialize_scan");
        } catch (err) {
            isScanningRef.current = false;
            setScanStatus("error");
            addToast?.(`スキャンの開始に失敗しました: ${String(err)}`, "error");
        }
    }, [addToast]);

    const refreshSettings = useCallback(async () => {
        const setting = await invoke<{ photoFolderPath?: string; secondaryPhotoFolderPath?: string }>("get_setting_cmd");
        setPhotoFolderPath(setting.photoFolderPath || "");
        setSecondaryPhotoFolderPath(setting.secondaryPhotoFolderPath || "");
    }, []);

    useEffect(() => {
        let disposed = false;
        const unlistenFns: UnlistenFn[] = [];

        const registerListeners = async () => {
            unlistenFns.push(await listen<ScanProgress>("scan:progress", (e) => setScanProgress(e.payload)));
            unlistenFns.push(await listen("scan:completed", () => {
                isScanningRef.current = false;
                setScanStatus("completed");
            }));
            unlistenFns.push(await listen<string>("scan:error", (event) => {
                isScanningRef.current = false;
                setScanStatus("error");
                addToast?.(event.payload || "スキャンに失敗しました。", "error");
            }));

            if (disposed) {
                unlistenFns.splice(0).forEach((unlisten) => unlisten());
            }
        };

        registerListeners().catch((err) => {
            addToast?.(`スキャンイベントの購読に失敗しました: ${String(err)}`, "error");
        });

        return () => {
            disposed = true;
            unlistenFns.splice(0).forEach((unlisten) => unlisten());
        };
    }, [addToast]);

    useEffect(() => {
        let cancelled = false;

        const initialize = async () => {
            try {
                const setting = await invoke<{ photoFolderPath?: string; secondaryPhotoFolderPath?: string }>("get_setting_cmd");
                if (cancelled) {
                    return;
                }

                const configuredPath = setting.photoFolderPath || "";
                const secondaryConfiguredPath = setting.secondaryPhotoFolderPath || "";
                setPhotoFolderPath(configuredPath);
                setSecondaryPhotoFolderPath(secondaryConfiguredPath);
                if (!configuredPath && !secondaryConfiguredPath) {
                    addToast?.("写真フォルダが未設定です。設定から参照フォルダを選択してください。", "info");
                    return;
                }

                await startScan();
            } catch (err) {
                if (!cancelled) {
                    addToast?.(`設定の読み込みに失敗しました: ${String(err)}`, "error");
                }
            }
        };

        initialize();
        return () => {
            cancelled = true;
        };
    }, [addToast, startScan]);

    const cancelScan = useCallback(async () => {
        try {
            await invoke("cancel_scan");
        } catch (err) {
            addToast?.(`スキャンの中断に失敗しました: ${String(err)}`, "error");
        }
    }, [addToast]);

    return {
        scanStatus,
        scanProgress,
        photoFolderPath,
        secondaryPhotoFolderPath,
        startScan,
        refreshSettings,
        cancelScan,
    };
};
