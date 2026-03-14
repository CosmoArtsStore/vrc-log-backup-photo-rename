import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ManagementSettings, RegistryCatalog, StorageStatus } from "../types";

export function useDashboardState() {
  const [registryApps, setRegistryApps] = useState<RegistryCatalog>({
    fastparty: [],
    thirdparty: [],
  });
  const [polarisRunning, setPolarisRunning] = useState(false);
  const [managementSettings, setManagementSettings] = useState<ManagementSettings>({
    startup_enabled: false,
    startup_preference_set: false,
    archive_limit_mb: 1000,
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

  const loadManagementSettings = useCallback(async () => {
    try {
      const settings: ManagementSettings = await invoke("get_management_settings");
      setManagementSettings(settings);
    } catch (err) {
      console.error("Management settings load failed", err);
    }
  }, []);

  const saveManagementSettings = useCallback(async (startupEnabled: boolean, archiveLimitMb: number) => {
    await invoke("save_management_settings", {
      startupEnabled,
      archiveLimitMb,
    });
    setManagementSettings({
      startup_enabled: startupEnabled,
      startup_preference_set: true,
      archive_limit_mb: archiveLimitMb,
    });
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
      const registry: RegistryCatalog = await invoke("read_registry_catalog");
      setRegistryApps(registry);
      await pollStorage();
      await pollStatus();
      await loadManagementSettings();
    } catch (err) {
      console.error("Dashboard init failed", err);
    }
  }, [loadManagementSettings, pollStatus, pollStorage]);

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
    registryApps,
    polarisRunning,
    managementSettings,
    storageStatus,
    pollStorage,
    pollStatus,
    saveManagementSettings,
  };
}
