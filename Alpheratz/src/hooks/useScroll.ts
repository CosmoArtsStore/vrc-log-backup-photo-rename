import { useState, useCallback, useRef, useEffect } from "react";

interface UseScrollArgs {
    photosLength: number;
    columnCount: number;
    gridHeight: number;
    ROW_HEIGHT: number;
}

const SCROLLBAR_PADDING = 8;

export const useScroll = ({ photosLength, columnCount, gridHeight, ROW_HEIGHT }: UseScrollArgs) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
    const mouseMoveHandlerRef = useRef<((ev: MouseEvent) => void) | null>(null);
    const mouseUpHandlerRef = useRef<(() => void) | null>(null);

    const totalRows = Math.ceil(photosLength / columnCount);
    const totalHeight = totalRows * ROW_HEIGHT;
    const maxScrollTop = Math.max(0, totalHeight - gridHeight);

    const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollContainerRef.current = e.currentTarget;
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const trackHeight = gridHeight - SCROLLBAR_PADDING;
    const thumbHeight = totalHeight > 0 ? Math.max(32, trackHeight * (gridHeight / totalHeight)) : trackHeight;
    const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * (trackHeight - thumbHeight) : 0;

    const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragStartRef.current = { y: e.clientY, scrollTop };
        setIsDragging(true);

        const onMouseMove = (ev: MouseEvent) => {
            if (!dragStartRef.current || !scrollContainerRef.current) return;
            const delta = ev.clientY - dragStartRef.current.y;
            const ratio = delta / Math.max(1, trackHeight - thumbHeight);
            const newScrollTop = Math.max(0, Math.min(maxScrollTop, dragStartRef.current.scrollTop + ratio * maxScrollTop));
            scrollContainerRef.current.scrollTop = newScrollTop;
        };

        const onMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            mouseMoveHandlerRef.current = null;
            mouseUpHandlerRef.current = null;
        };

        mouseMoveHandlerRef.current = onMouseMove;
        mouseUpHandlerRef.current = onMouseUp;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, [scrollTop, trackHeight, maxScrollTop, thumbHeight]);

    useEffect(() => {
        return () => {
            if (mouseMoveHandlerRef.current) {
                document.removeEventListener("mousemove", mouseMoveHandlerRef.current);
            }
            if (mouseUpHandlerRef.current) {
                document.removeEventListener("mouseup", mouseUpHandlerRef.current);
            }
        };
    }, []);

    const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const ratio = (clickY - thumbHeight / 2) / Math.max(1, trackHeight - thumbHeight);
        scrollContainerRef.current.scrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
    }, [thumbHeight, trackHeight, maxScrollTop]);

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
