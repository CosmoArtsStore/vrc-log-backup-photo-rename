export interface Photo {
    photo_filename: string;
    photo_path: string;
    world_id: string | null;
    world_name: string | null;
    timestamp: string;
    memo: string;
    phash: string | null;
    width?: number | null;
    height?: number | null;
    orientation?: "portrait" | "landscape" | "square" | "unknown" | null;
    histogram?: number[] | null;
    is_favorite: boolean;
    tags: string[];
    match_source?: "metadata" | "title" | "phash" | null;
}

export interface ScanProgress {
    processed: number;
    total: number;
    current_world: string;
    phase: string;
}

export interface MonthGroup {
    key: string;
    year: number;
    month: number;
    label: string;
    rowIndex: number;
    count: number;
}
