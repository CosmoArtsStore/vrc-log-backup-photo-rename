import { useEffect, useRef, useState } from "react";
import { MonthGroup } from "../types";

interface MonthNavProps {
    monthsByYear: [number, MonthGroup[]][];
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
    scrollTop: number;
    maxScrollTop: number;
    handleJumpToRatio: (ratio: number, smooth?: boolean) => void;
}

export const MonthNav = ({
    monthGroups,
    activeMonthIndex,
    scrollTop,
    maxScrollTop,
    handleJumpToRatio,
}: MonthNavProps) => {
    const navRef = useRef<HTMLElement | null>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const scrollHideTimerRef = useRef<number | null>(null);

    useEffect(() => {
        setIsVisible(true);

        if (scrollHideTimerRef.current !== null) {
            window.clearTimeout(scrollHideTimerRef.current);
        }

        scrollHideTimerRef.current = window.setTimeout(() => {
            setIsVisible(false);
            scrollHideTimerRef.current = null;
        }, 900);
    }, [scrollTop]);

    useEffect(() => {
        return () => {
            if (scrollHideTimerRef.current !== null) {
                window.clearTimeout(scrollHideTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isScrubbing) {
            return;
        }

        const handleMouseMove = (event: MouseEvent) => {
            jumpByPointer(event.clientY, false);
        };

        const handleMouseUp = () => {
            setIsScrubbing(false);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isScrubbing]);

    const getRatioFromPointer = (clientY: number) => {
        if (!navRef.current || monthGroups.length === 0) {
            return 0;
        }

        const rect = navRef.current.getBoundingClientRect();
        const inset = 20;
        const trackHeight = Math.max(1, rect.height - inset * 2);
        return Math.max(0, Math.min(1, (clientY - rect.top - inset) / trackHeight));
    };

    const jumpByPointer = (clientY: number, smooth: boolean) => {
        handleJumpToRatio(getRatioFromPointer(clientY), smooth);
    };

    const scrollRatio = maxScrollTop > 0 ? Math.max(0, Math.min(1, scrollTop / maxScrollTop)) : 0;
    const displayIndex = monthGroups.length > 0
        ? Math.max(0, Math.min(monthGroups.length - 1, Math.round(scrollRatio * (monthGroups.length - 1))))
        : activeMonthIndex;
    const displayGroup = monthGroups[displayIndex];
    const scanLineTop = `calc(20px + (100% - 40px) * ${scrollRatio})`;

    return (
        <nav
            ref={navRef}
            className={`month-nav ${isScrubbing ? "scrubbing" : ""} ${isVisible ? "visible" : ""}`}
            onMouseDown={(event) => {
                setIsScrubbing(true);
                setIsVisible(true);
                jumpByPointer(event.clientY, false);
            }}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => {
                if (!isScrubbing) {
                    setIsVisible(false);
                }
            }}
            aria-label="月移動バー"
        >
            <div className="month-nav-spine" aria-hidden="true" />
            <div className="month-nav-scan-line" style={{ top: scanLineTop }} aria-hidden="true" />
            {monthGroups.map((g, index) => {
                const isYearStart = index === 0 || monthGroups[index - 1].year !== g.year;
                return (
                    <button
                        key={g.key}
                        className={`month-nav-item ${isYearStart ? "year-start" : ""} ${index === activeMonthIndex ? "active" : ""}`}
                        onClick={() => handleJumpToRatio((index + 0.5) / monthGroups.length, true)}
                        onMouseDown={(event) => {
                            setIsScrubbing(true);
                            setIsVisible(true);
                            jumpByPointer(event.clientY, false);
                        }}
                        aria-label={`${g.year}年 ${g.label}`}
                        type="button"
                    >
                        <span className="month-nav-tick" aria-hidden="true" />
                        {isYearStart && <span className="month-nav-year">{g.year}</span>}
                    </button>
                );
            })}
            {displayGroup && (
                <div className={`month-nav-tooltip ${isVisible ? "visible" : ""}`} style={{ top: scanLineTop }} aria-hidden="true">
                    <div className="month-nav-tooltip-inner">
                        <span className="month-nav-tooltip-year">{displayGroup.year}</span>
                        <span className="month-nav-tooltip-month">{displayGroup.label}</span>
                    </div>
                </div>
            )}
        </nav>
    );
};
