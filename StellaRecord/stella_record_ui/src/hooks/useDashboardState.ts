import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppCard, StorageStatus } from "../types";

export function useDashboardState() {
  const [pleiadesApps, setPleiadesApps] = useState<AppCard[]>([]);
  const [jewelBoxApps, setJewelBoxApps] = useState<AppCard[]>([]);
  const [polarisRunning, setPolarisRunning] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    current: 0,
    limit: 0,
    percent: 0,
  });

  const pollStorage = useCallback(async () => {
    try {
      const [current, limit]: [number, number] = await invoke("get_storage_status");
      const percent = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
      setStorageStatus({ current, limit, percent });
    } catch (err) {
      console.error("Storage update failed", err);
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const running: boolean = await invoke("get_polaris_status");
      setPolarisRunning(running);
    } catch (err) {
      console.error("Polaris polling failed", err);
    }
  }, []);

  const loadDashboardState = useCallback(async () => {
    try {
      const pleiades: AppCard[] = await invoke("read_launcher_json", { section: "pleiades" });
      const jewelbox: AppCard[] = await invoke("read_launcher_json", { section: "jewelbox" });
      setPleiadesApps(pleiades);
      setJewelBoxApps(jewelbox);
      await pollStorage();
      await pollStatus();
    } catch (err) {
      console.error("Dashboard init failed", err);
    }
  }, [pollStatus, pollStorage]);

  useEffect(() => {
    loadDashboardState();

    const storageInterval = setInterval(pollStorage, 30000);
    const polarisInterval = setInterval(pollStatus, 3000);
    return () => {
      clearInterval(storageInterval);
      clearInterval(polarisInterval);
    };
  }, [loadDashboardState, pollStatus, pollStorage]);

  return {
    pleiadesApps,
    jewelBoxApps,
    polarisRunning,
    storageStatus,
    pollStorage,
    pollStatus,
  };
}
