import { UIEvent, MouseEvent, CSSProperties } from "react";
import { Grid as FixedSizeGrid } from "react-window";
import { Photo } from "../types";
import { PhotoCard } from "./PhotoCard";
import { CustomScrollbar } from "./CustomScrollbar";
import { GalleryPhotoCard } from "./GalleryPhotoCard";

interface PhotoGridCellProps {
    data: Photo[];
    onSelect: (photo: Photo) => void;
    columnCount: number;
}

interface FixedSizeGridComponentProps {
    columnCount: number;
    columnWidth: number;
    rowCount: number;
    rowHeight: number;
    cellComponent: typeof PhotoCard;
    cellProps: PhotoGridCellProps;
    onScroll: (e: UIEvent<HTMLDivElement>) => void;
    outerRef: (node: HTMLDivElement | null) => void;
    style: CSSProperties;
    className: string;
}

interface PhotoGridProps {
    photos: Photo[];
    viewMode: "standard" | "gallery";
    columnCount: number;
    CARD_WIDTH: number;
    totalRows: number;
    ROW_HEIGHT: number;
    gridHeight: number;
    panelWidth: number;
    handleGridScroll: (e: UIEvent<HTMLDivElement>) => void;
    handleGridWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
    isDragging: boolean;
    thumbTop: number;
    thumbHeight: number;
    handleTrackClick: (e: MouseEvent<HTMLDivElement>) => void;
    handleScrollbarMouseDown: (e: MouseEvent) => void;
    totalHeight: number;
    cellProps: PhotoGridCellProps;
    onGridRef: (node: HTMLDivElement | null) => void;
}

const FixedSizeGridComponent = FixedSizeGrid as unknown as React.ComponentType<FixedSizeGridComponentProps>;

const getGalleryCardHeight = (photo: Photo) => {
    if (photo.orientation === "portrait") {
        return 360;
    }
    if (photo.orientation === "landscape") {
        return 220;
    }
    return 280;
};

const buildMasonryColumns = (photos: Photo[], columnCount: number) => {
    const columns = Array.from({ length: Math.max(1, columnCount) }, () => ({
        height: 0,
        photos: [] as Photo[],
    }));

    photos.forEach((photo) => {
        let targetColumn = columns[0];
        for (const column of columns) {
            if (column.height < targetColumn.height) {
                targetColumn = column;
            }
        }
        targetColumn.photos.push(photo);
        targetColumn.height += getGalleryCardHeight(photo);
    });

    return columns.map((column) => column.photos);
};

export const PhotoGrid = ({
    photos,
    viewMode,
    columnCount,
    CARD_WIDTH,
    totalRows,
    ROW_HEIGHT,
    gridHeight,
    panelWidth,
    handleGridScroll,
    handleGridWheel,
    isDragging,
    thumbTop,
    thumbHeight,
    handleTrackClick,
    handleScrollbarMouseDown,
    totalHeight,
    cellProps,
    onGridRef,
}: PhotoGridProps) => {
    if (viewMode === "gallery") {
        const masonryColumns = buildMasonryColumns(photos, columnCount);
        return (
            <div className="grid-scroll-wrapper gallery-mode-shell">
                <div
                    className="gallery-grid"
                    style={{
                        height: gridHeight,
                        width: panelWidth,
                        ["--gallery-columns" as string]: String(Math.max(1, columnCount)),
                    }}
                >
                    {masonryColumns.map((columnPhotos, columnIndex) => (
                        <div key={`gallery-column-${columnIndex}`} className="gallery-grid-column">
                            {columnPhotos.map((photo) => (
                                <div key={photo.photo_path} className="gallery-photo-card-wrapper">
                                    <GalleryPhotoCard photo={photo} onSelect={cellProps.onSelect} />
                                </div>
                            ))}
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
                        columnWidth={CARD_WIDTH}
                        rowCount={totalRows}
                        rowHeight={ROW_HEIGHT}
                        cellComponent={PhotoCard as any}
                        cellProps={cellProps}
                        onScroll={handleGridScroll}
                        outerRef={onGridRef}
                        style={{ height: gridHeight, width: panelWidth }}
                        className="photo-grid"
                    />
                    {totalHeight > gridHeight && (
                        <CustomScrollbar
                            isDragging={isDragging}
                            thumbTop={thumbTop}
                            thumbHeight={thumbHeight}
                            handleTrackClick={handleTrackClick}
                            handleScrollbarMouseDown={handleScrollbarMouseDown}
                        />
                    )}
                </>
            )}
        </div>
    );
};
