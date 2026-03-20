import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";

interface UseScrollArgs {
    photosLength: number;
    columnCount: number;
    gridHeight: number;
    ROW_HEIGHT: number;
    totalHeightOverride?: number;
}

export const useScroll = ({ photosLength, columnCount, gridHeight, ROW_HEIGHT, totalHeightOverride }: UseScrollArgs) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const animationFrameRef = useRef<number | null>(null);
    const pendingScrollTopRef = useRef(0);

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

    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

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

    const handleJumpToRatio = useCallback((ratio: number, smooth = false) => {
        if (!scrollContainerRef.current) {
            return;
        }

        const nextScrollTop = Math.max(0, Math.min(maxScrollTop, ratio * maxScrollTop));
        pendingScrollTopRef.current = nextScrollTop;
        setScrollTop(nextScrollTop);

        if (smooth) {
            scrollContainerRef.current.scrollTo({
                top: nextScrollTop,
                behavior: "smooth",
            });
            return;
        }

        scrollContainerRef.current.scrollTop = nextScrollTop;
    }, [maxScrollTop]);

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
        totalHeight,
        onGridRef,
        handleGridScroll,
        handleGridWheel,
        handleJumpToRow,
        handleJumpToRatio,
        maxScrollTop,
    };
};
