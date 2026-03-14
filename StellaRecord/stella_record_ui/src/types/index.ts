export interface AppCard {
  name: string;
  description: string;
  path: string;
  icon_path?: string;
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

export type Section = "dashboard" | "analyze" | "pleiades" | "jewelbox" | "database";
export type DangerAction = "deleteToday" | "wipeDatabase";
