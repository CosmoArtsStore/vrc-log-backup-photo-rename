import { useState, useCallback, useRef } from "react";

interface UseScrollArgs {
    photosLength: number;
    columnCount: number;
    gridHeight: number;
    ROW_HEIGHT: number;
}

export const useScroll = ({ photosLength, columnCount, gridHeight, ROW_HEIGHT }: UseScrollArgs) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

    const totalRows = Math.ceil(photosLength / columnCount);
    const totalHeight = totalRows * ROW_HEIGHT;
    const maxScrollTop = Math.max(0, totalHeight - gridHeight);

    const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollContainerRef.current = e.currentTarget;
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const thumbHeight = totalHeight > 0 ? Math.max(32, (gridHeight - 8) * (gridHeight / totalHeight)) : (gridHeight - 8);
    const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * ((gridHeight - 8) - thumbHeight) : 0;

    const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragStartRef.current = { y: e.clientY, scrollTop };
        setIsDragging(true);

        const onMouseMove = (ev: MouseEvent) => {
            if (!dragStartRef.current || !scrollContainerRef.current) return;
            const delta = ev.clientY - dragStartRef.current.y;
            const ratio = delta / Math.max(1, (gridHeight - 8) - thumbHeight);
            const newScrollTop = Math.max(0, Math.min(maxScrollTop, dragStartRef.current.scrollTop + ratio * maxScrollTop));
            scrollContainerRef.current.scrollTop = newScrollTop;
        };

        const onMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [scrollTop, gridHeight, maxScrollTop, thumbHeight]);

    const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const ratio = (clickY - thumbHeight / 2) / Math.max(1, (gridHeight - 8) - thumbHeight);
        scrollContainerRef.current.scrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
    }, [thumbHeight, gridHeight, maxScrollTop]);

    const handleJumpToRow = useCallback((rowIndex: number) => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = rowIndex * ROW_HEIGHT;
        }
    }, [ROW_HEIGHT]);

    const onGridRef = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            scrollContainerRef.current = node;
        }
    }, []);

    return {
        scrollTop,
        thumbTop,
        thumbHeight,
        isDragging,
        totalHeight,
        onGridRef,
        handleGridScroll,
        handleScrollbarMouseDown,
        handleTrackClick,
        handleJumpToRow,
    };
};
