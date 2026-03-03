import { useState, useRef, useEffect } from "react";

export const useGridDimensions = (CARD_WIDTH: number) => {
    const rightPanelRef = useRef<HTMLDivElement>(null);
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [panelWidth, setPanelWidth] = useState(800);
    const [gridWrapperHeight, setGridWrapperHeight] = useState(600);

    useEffect(() => {
        const rpObs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setPanelWidth(entry.contentRect.width);
            }
        });
        const gwObs = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setGridWrapperHeight(entry.contentRect.height);
            }
        });
        if (rightPanelRef.current) rpObs.observe(rightPanelRef.current);
        if (gridWrapperRef.current) gwObs.observe(gridWrapperRef.current);
        return () => { rpObs.disconnect(); gwObs.disconnect(); };
    }, []);

    const columnCount = Math.max(1, Math.floor(panelWidth / CARD_WIDTH));
    const gridHeight = Math.max(200, gridWrapperHeight);

    return { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount };
};
