import { MouseEvent } from "react";

interface CustomScrollbarProps {
    isDragging: boolean;
    thumbTop: number;
    thumbHeight: number;
    handleTrackClick: (e: MouseEvent<HTMLDivElement>) => void;
    handleScrollbarMouseDown: (e: MouseEvent) => void;
}

export const CustomScrollbar = ({
    isDragging,
    thumbTop,
    thumbHeight,
    handleTrackClick,
    handleScrollbarMouseDown,
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
        </div>
    );
};
