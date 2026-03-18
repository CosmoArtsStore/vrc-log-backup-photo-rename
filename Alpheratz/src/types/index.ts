export interface Photo {
    photo_filename: string;
    photo_path: string;
    world_id: string | null;
    world_name: string | null;
    timestamp: string;
    memo: string;
    phash: string | null;
    orientation?: "portrait" | "landscape" | "unknown" | null;
    image_width?: number | null;
    image_height?: number | null;
    source_slot?: number | null;
    is_favorite: boolean;
    tags: string[];
    match_source?: "metadata" | "title" | "stella_db" | "phash" | null;
    is_missing?: boolean;
}

export interface DisplayPhotoItem {
    photo: Photo;
    groupCount?: number;
    groupPhotos?: Photo[];
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
