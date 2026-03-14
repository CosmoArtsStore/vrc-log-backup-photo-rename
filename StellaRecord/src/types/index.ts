export interface AppCard {
  name: string;
  description: string;
  path: string;
  icon_path?: string;
}

export interface RegistryCatalog {
  fastparty: AppCard[];
  thirdparty: AppCard[];
}

export interface TableData {
  columns: string[];
  rows: string[][];
}

export interface ToastItem {
  id: number;
  msg: string;
}

export interface StorageStatus {
  current: number;
  limit: number;
  percent: number;
}

export interface ManagementSettings {
  startup_enabled: boolean;
  startup_preference_set: boolean;
  archive_limit_mb: number;
}

export type Section = "dashboard" | "analyze" | "registry" | "database";
export type DangerAction = "deleteToday" | "wipeDatabase";
