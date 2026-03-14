import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppCard, StartupPreference, StorageStatus } from "../types";

export function useDashboardState() {
  const [pleiadesApps, setPleiadesApps] = useState<AppCard[]>([]);
  const [jewelBoxApps, setJewelBoxApps] = useState<AppCard[]>([]);
  const [polarisRunning, setPolarisRunning] = useState(false);
  const [startupPreference, setStartupPreference] = useState<StartupPreference>({
    enabled: false,
    preference_set: false,
  });
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

  const loadStartupPreference = useCallback(async () => {
    try {
      const startup: StartupPreference = await invoke("get_startup_preference");
      setStartupPreference(startup);
    } catch (err) {
      console.error("Startup preference load failed", err);
    }
  }, []);

  const saveStartupPreference = useCallback(async (enabled: boolean) => {
    await invoke("save_startup_preference", { enabled });
    setStartupPreference({ enabled, preference_set: true });
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
      await loadStartupPreference();
    } catch (err) {
      console.error("Dashboard init failed", err);
    }
  }, [loadStartupPreference, pollStatus, pollStorage]);

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
    startupPreference,
    storageStatus,
    pollStorage,
    pollStatus,
    saveStartupPreference,
  };
}
