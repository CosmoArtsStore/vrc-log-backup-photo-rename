import { UIEvent, CSSProperties } from "react";
import { Grid as FixedSizeGrid } from "react-window";
import { DisplayPhotoItem } from "../types";
import { PhotoCard } from "./PhotoCard";
import { GalleryPhotoCard } from "./GalleryPhotoCard";
import { GalleryLayoutResult } from "./galleryLayout";

interface PhotoGridCellProps {
    data: DisplayPhotoItem[];
    onSelect: (item: DisplayPhotoItem) => void;
    onToggleSelect: (item: DisplayPhotoItem, shiftKey: boolean) => void;
    isSelected: (item: DisplayPhotoItem) => boolean;
    showTags: boolean;
    columnCount: number;
}

interface FixedSizeGridComponentProps {
    columnCount: number;
    columnWidth: number;
    rowCount: number;
    rowHeight: number;
    cellComponent: typeof PhotoCard;
    cellProps: any;
    onScroll: (e: UIEvent<HTMLDivElement>) => void;
    outerRef: (node: HTMLDivElement | null) => void;
    style: CSSProperties;
    className: string;
}

interface PhotoGridProps {
    photos: DisplayPhotoItem[];
    viewMode: "standard" | "gallery";
    scrollTop: number;
    columnCount: number;
    columnWidth: number;
    totalRows: number;
    ROW_HEIGHT: number;
    gridHeight: number;
    panelWidth: number;
    handleGridScroll: (e: UIEvent<HTMLDivElement>) => void;
    handleGridWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
    totalHeight: number;
    galleryLayout?: GalleryLayoutResult | null;
    cellProps: PhotoGridCellProps;
    onGridRef: (node: HTMLDivElement | null) => void;
}

const FixedSizeGridComponent = FixedSizeGrid as unknown as React.ComponentType<FixedSizeGridComponentProps>;

export const PhotoGrid = ({
    photos,
    viewMode,
    scrollTop,
    columnCount,
    columnWidth,
    totalRows,
    ROW_HEIGHT,
    gridHeight,
    panelWidth,
    handleGridScroll,
    handleGridWheel,
    totalHeight,
    galleryLayout = null,
    cellProps,
    onGridRef,
}: PhotoGridProps) => {
    if (viewMode === "gallery") {
        const overscan = 48;
        const visibleTop = Math.max(0, scrollTop - overscan);
        const visibleBottom = scrollTop + gridHeight + overscan;
        const visibleItems = (galleryLayout?.items ?? []).filter((item) => (
            item.top + item.height >= visibleTop && item.top <= visibleBottom
        ));

        return (
            <div
                className="grid-scroll-wrapper gallery-mode-shell"
                onWheel={handleGridWheel}
                onScroll={handleGridScroll}
                ref={onGridRef}
                style={{ height: gridHeight, width: panelWidth }}
            >
                <div
                    className="gallery-grid"
                    style={{
                        height: totalHeight,
                        width: panelWidth,
                    }}
                >
                    {visibleItems.map((item) => (
                        <div
                            key={item.photo.photo_path}
                            className="gallery-photo-card-wrapper"
                            style={{
                                position: "absolute",
                                top: item.top,
                                left: item.left,
                                width: item.width,
                                height: item.height,
                            }}
                        >
                            <GalleryPhotoCard
                                item={item}
                                onSelect={cellProps.onSelect}
                                onToggleSelect={cellProps.onToggleSelect}
                                selected={cellProps.isSelected(item)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
            <div className="grid-scroll-wrapper" onWheel={handleGridWheel}>
            {photos.length > 0 && (
                <>
                    <FixedSizeGridComponent
                        columnCount={columnCount}
                        columnWidth={columnWidth}
                        rowCount={totalRows}
                        rowHeight={ROW_HEIGHT}
                        cellComponent={PhotoCard as any}
                        cellProps={cellProps}
                        onScroll={handleGridScroll}
                        outerRef={onGridRef}
                        style={{ height: gridHeight, width: panelWidth }}
                        className="photo-grid"
                    />
                </>
            )}
        </div>
    );
};
