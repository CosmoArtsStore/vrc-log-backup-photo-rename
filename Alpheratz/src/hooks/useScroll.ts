import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";

interface UseScrollArgs {
    photosLength: number;
    columnCount: number;
    gridHeight: number;
    ROW_HEIGHT: number;
    totalHeightOverride?: number;
}

const SCROLLBAR_PADDING = 8;
const SCROLLBAR_MIN_THUMB_HEIGHT = 32;

export const useScroll = ({ photosLength, columnCount, gridHeight, ROW_HEIGHT, totalHeightOverride }: UseScrollArgs) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const pendingScrollTopRef = useRef(0);
    const mouseMoveHandlerRef = useRef<((ev: MouseEvent) => void) | null>(null);
    const mouseUpHandlerRef = useRef<(() => void) | null>(null);

    const totalRows = Math.ceil(photosLength / columnCount);
    const totalHeight = totalHeightOverride ?? totalRows * ROW_HEIGHT;
    const maxScrollTop = Math.max(0, totalHeight - gridHeight);

    useLayoutEffect(() => {
        const nextScrollTop = Math.max(0, Math.min(maxScrollTop, pendingScrollTopRef.current));
        pendingScrollTopRef.current = nextScrollTop;
        setScrollTop(nextScrollTop);
        if (scrollContainerRef.current && Math.abs(scrollContainerRef.current.scrollTop - nextScrollTop) > 1) {
            scrollContainerRef.current.scrollTop = nextScrollTop;
        }
    }, [maxScrollTop, photosLength, columnCount, gridHeight, totalHeightOverride]);

    const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        scrollContainerRef.current = e.currentTarget;
        pendingScrollTopRef.current = e.currentTarget.scrollTop;
        if (animationFrameRef.current !== null) {
            return;
        }
        animationFrameRef.current = window.requestAnimationFrame(() => {
            animationFrameRef.current = null;
            setScrollTop(pendingScrollTopRef.current);
        });
    }, []);

    const trackHeight = gridHeight - SCROLLBAR_PADDING;
    const thumbHeight = totalHeight > 0
        ? Math.max(SCROLLBAR_MIN_THUMB_HEIGHT, trackHeight * (gridHeight / totalHeight))
        : trackHeight;
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
        try {
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        } catch (err) {
            setIsDragging(false);
            dragStartRef.current = null;
            mouseMoveHandlerRef.current = null;
            mouseUpHandlerRef.current = null;
            throw err;
        }
    }, [scrollTop, trackHeight, maxScrollTop, thumbHeight]);

    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
            }
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
        scrollContainerRef.current.scrollTo({
            top: Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop)),
            behavior: "smooth",
        });
    }, [thumbHeight, trackHeight, maxScrollTop]);

    const handleJumpToRow = useCallback((rowIndex: number) => {
        if (scrollContainerRef.current) {
            const nextScrollTop = rowIndex * ROW_HEIGHT;
            pendingScrollTopRef.current = nextScrollTop;
            setScrollTop(nextScrollTop);
            scrollContainerRef.current.scrollTo({
                top: nextScrollTop,
                behavior: "smooth",
            });
        }
    }, [ROW_HEIGHT]);

    const handleGridWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!scrollContainerRef.current || maxScrollTop <= 0) {
            return;
        }

        e.preventDefault();
        const container = scrollContainerRef.current;
        const nextScrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + e.deltaY));
        pendingScrollTopRef.current = nextScrollTop;
        setScrollTop(nextScrollTop);
        container.scrollTop = nextScrollTop;
    }, [maxScrollTop]);

    const onGridRef = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            scrollContainerRef.current = node;
            const nextScrollTop = Math.max(0, Math.min(maxScrollTop, pendingScrollTopRef.current));
            pendingScrollTopRef.current = nextScrollTop;
            if (Math.abs(node.scrollTop - nextScrollTop) > 1) {
                node.scrollTop = nextScrollTop;
            }
            setScrollTop(nextScrollTop);
        }
    }, [maxScrollTop]);

    return {
        scrollTop,
        thumbTop,
        thumbHeight,
        isDragging,
        totalHeight,
        onGridRef,
        handleGridScroll,
        handleGridWheel,
        handleScrollbarMouseDown,
        handleTrackClick,
        handleJumpToRow,
    };
};
