import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type AddToast = (msg: string) => void;

export function useAnalyzeState(pollStorage: () => Promise<void>, addToast: AddToast) {
  const [analyzeRunning, setAnalyzeRunning] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");

  useEffect(() => {
    const unlistenAnalyze = listen("analyze-progress", (event) => {
      const payload = event.payload as {
        status: string;
        progress: string;
        is_running: boolean;
      };
      setAnalyzeStatus(payload.status);
      setAnalyzeProgress(payload.progress);
      setAnalyzeRunning(payload.is_running);
      if (!payload.is_running) {
        void pollStorage();
      }
    });

    const unlistenFinished = listen("analyze-finished", () => {
      setAnalyzeRunning(false);
      setAnalyzeStatus("待機中");
      setAnalyzeProgress("");
      void pollStorage();
    });

    return () => {
      unlistenAnalyze.then((dispose) => dispose());
      unlistenFinished.then((dispose) => dispose());
    };
  }, [pollStorage]);

  const handleSync = useCallback(async () => {
    try {
      setAnalyzeRunning(true);
      await invoke("launch_analyze", { mode: "import" });
    } catch (err) {
      setAnalyzeRunning(false);
      addToast(`解析エラー: ${err}`);
    }
  }, [addToast]);

  const handleCancelSync = useCallback(async () => {
    try {
      await invoke("cancel_analyze");
      addToast("解析を停止しました");
    } catch (err) {
      addToast(`停止エラー: ${err}`);
    }
  }, [addToast]);

  return {
    analyzeRunning,
    analyzeProgress,
    analyzeStatus,
    setAnalyzeRunning,
    handleSync,
    handleCancelSync,
  };
}
