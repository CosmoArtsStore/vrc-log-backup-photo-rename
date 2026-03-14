import { UIEvent, MouseEvent, CSSProperties } from "react";
import { Grid as FixedSizeGrid } from "react-window";
import { Photo } from "../types";
import { PhotoCard } from "./PhotoCard";
import { CustomScrollbar } from "./CustomScrollbar";

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

export const PhotoGrid = ({
    photos,
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
