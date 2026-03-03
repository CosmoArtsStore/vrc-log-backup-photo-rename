import { useMemo } from "react";
import { Photo, MonthGroup } from "../types";

export const useMonthGroups = (photos: Photo[], columnCount: number, scrollTop: number, ROW_HEIGHT: number) => {
    const monthGroups = useMemo((): MonthGroup[] => {
        if (!photos.length) return [];
        const groups: MonthGroup[] = [];
        let currentKey = "";

        photos.forEach((photo, i) => {
            const date = new Date(photo.timestamp.replace(" ", "T"));
            const year = isNaN(date.getFullYear()) ? 0 : date.getFullYear();
            const month = isNaN(date.getMonth()) ? 1 : date.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, "0")}`;

            if (key !== currentKey) {
                currentKey = key;
                groups.push({
                    key,
                    year,
                    month,
                    label: `${month}月`,
                    rowIndex: Math.floor(i / columnCount),
                    count: 1
                });
            } else {
                groups[groups.length - 1].count++;
            }
        });
        return groups;
    }, [photos, columnCount]);

    const monthsByYear = useMemo(() => {
        const map = new Map<number, MonthGroup[]>();
        for (const g of monthGroups) {
            if (!map.has(g.year)) map.set(g.year, []);
            map.get(g.year)!.push(g);
        }
        return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
    }, [monthGroups]);

    const activeMonthIndex = useMemo(() => {
        if (!monthGroups.length) return 0;
        const currentRow = Math.floor(scrollTop / ROW_HEIGHT);
        let active = 0;
        for (let i = 0; i < monthGroups.length; i++) {
            if (monthGroups[i].rowIndex <= currentRow) active = i;
            else break;
        }
        return active;
    }, [monthGroups, scrollTop, ROW_HEIGHT]);

    return { monthGroups, monthsByYear, activeMonthIndex };
};
