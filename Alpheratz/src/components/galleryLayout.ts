import { Photo } from "../types";

export interface GalleryLayoutItem {
    photo: Photo;
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface GalleryLayoutResult {
    items: GalleryLayoutItem[];
    totalHeight: number;
    columnWidth: number;
    columnCount: number;
    gap: number;
}

const GALLERY_GAP = 14;
const GALLERY_MIN_COLUMN_WIDTH = 220;
const GALLERY_MIN_CARD_HEIGHT = 170;
const GALLERY_MAX_CARD_HEIGHT = 520;

const getPhotoAspectRatio = (photo: Photo) => {
    const width = photo.image_width ?? null;
    const height = photo.image_height ?? null;

    if (width && height && width > 0 && height > 0) {
        return width / height;
    }
    if (photo.orientation === "portrait") {
        return 9 / 16;
    }
    if (photo.orientation === "landscape") {
        return 16 / 9;
    }
    return 1;
};

const getCardHeight = (photo: Photo, columnWidth: number) => {
    const aspectRatio = getPhotoAspectRatio(photo);
    const rawHeight = columnWidth / Math.max(0.2, aspectRatio);
    return Math.max(GALLERY_MIN_CARD_HEIGHT, Math.min(GALLERY_MAX_CARD_HEIGHT, Math.round(rawHeight)));
};

export const buildVirtualGalleryLayout = (
    photos: Photo[],
    panelWidth: number,
    requestedColumnCount: number,
): GalleryLayoutResult => {
    const columnCount = Math.max(1, requestedColumnCount);
    const availableWidth = Math.max(panelWidth - 8, GALLERY_MIN_COLUMN_WIDTH);
    const columnWidth = Math.max(
        GALLERY_MIN_COLUMN_WIDTH,
        Math.floor((availableWidth - GALLERY_GAP * (columnCount - 1)) / columnCount),
    );
    const columnHeights = Array.from({ length: columnCount }, () => 0);

    const items = photos.map((photo) => {
        let targetColumn = 0;
        for (let index = 1; index < columnHeights.length; index += 1) {
            if (columnHeights[index] < columnHeights[targetColumn]) {
                targetColumn = index;
            }
        }

        const top = columnHeights[targetColumn];
        const height = getCardHeight(photo, columnWidth);
        const left = targetColumn * (columnWidth + GALLERY_GAP);
        columnHeights[targetColumn] += height + GALLERY_GAP;

        return {
            photo,
            top,
            left,
            width: columnWidth,
            height,
        };
    });

    const totalHeight = Math.max(0, ...columnHeights) - (photos.length > 0 ? GALLERY_GAP : 0);

    return {
        items,
        totalHeight: Math.max(totalHeight, 0),
        columnWidth,
        columnCount,
        gap: GALLERY_GAP,
    };
};
