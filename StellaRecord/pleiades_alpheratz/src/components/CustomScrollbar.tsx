import { MouseEvent } from "react";
import { MonthGroup } from "../types";

interface CustomScrollbarProps {
    isDragging: boolean;
    thumbTop: number;
    thumbHeight: number;
    handleTrackClick: (e: MouseEvent<HTMLDivElement>) => void;
    handleScrollbarMouseDown: (e: MouseEvent) => void;
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
}

export const CustomScrollbar = ({
    isDragging,
    thumbTop,
    thumbHeight,
    handleTrackClick,
    handleScrollbarMouseDown,
    monthGroups,
    activeMonthIndex,
}: CustomScrollbarProps) => {
    return (
        <div className={`custom-scrollbar ${isDragging ? "dragging" : ""}`}>
            <div className="scrollbar-track" onClick={handleTrackClick}>
                <div
                    className={`scrollbar-thumb ${isDragging ? "dragging" : ""}`}
                    style={{ top: thumbTop, height: thumbHeight }}
                    onMouseDown={handleScrollbarMouseDown}
                />
            </div>
            <div className="scroll-month-indicator" style={{ top: Math.max(0, thumbTop - 10) }}>
                {monthGroups[activeMonthIndex]
                    ? `${monthGroups[activeMonthIndex].year}年${monthGroups[activeMonthIndex].month}月`
                    : ""}
            </div>
        </div>
    );
};
