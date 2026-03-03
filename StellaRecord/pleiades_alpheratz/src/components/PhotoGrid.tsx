import { UIEvent, MouseEvent } from "react";
import { Grid as FixedSizeGrid } from "react-window";
import { Photo, MonthGroup } from "../types";
import { PhotoCard } from "./PhotoCard";
import { CustomScrollbar } from "./CustomScrollbar";

interface PhotoGridProps {
    photos: Photo[];
    columnCount: number;
    CARD_WIDTH: number;
    totalRows: number;
    ROW_HEIGHT: number;
    gridHeight: number;
    panelWidth: number;
    handleGridScroll: (e: UIEvent<HTMLDivElement>) => void;
    isDragging: boolean;
    thumbTop: number;
    thumbHeight: number;
    handleTrackClick: (e: MouseEvent<HTMLDivElement>) => void;
    handleScrollbarMouseDown: (e: MouseEvent) => void;
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
    totalHeight: number;
    cellProps: any;
    onGridRef: (node: HTMLDivElement | null) => void;
}

const FixedSizeGridComponent = FixedSizeGrid as any;

export const PhotoGrid = ({
    photos,
    columnCount,
    CARD_WIDTH,
    totalRows,
    ROW_HEIGHT,
    gridHeight,
    panelWidth,
    handleGridScroll,
    isDragging,
    thumbTop,
    thumbHeight,
    handleTrackClick,
    handleScrollbarMouseDown,
    monthGroups,
    activeMonthIndex,
    totalHeight,
    cellProps,
    onGridRef,
}: PhotoGridProps) => {
    return (
        <div className="grid-scroll-wrapper">
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
                            handleScrollbarMouseDown={handleScrollbarMouseDown as any}
                            monthGroups={monthGroups}
                            activeMonthIndex={activeMonthIndex}
                        />
                    )}
                </>
            )}
        </div>
    );
};
