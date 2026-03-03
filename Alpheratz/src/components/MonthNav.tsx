import { MonthGroup } from "../types";

interface MonthNavProps {
    monthsByYear: [number, MonthGroup[]][];
    monthGroups: MonthGroup[];
    activeMonthIndex: number;
    handleJumpToMonth: (group: MonthGroup) => void;
}

export const MonthNav = ({
    monthsByYear,
    monthGroups,
    activeMonthIndex,
    handleJumpToMonth,
}: MonthNavProps) => {
    return (
        <nav className="month-nav">
            {monthsByYear.map(([year, months]) => (
                <div key={year}>
                    <div className="month-nav-year">{year}</div>
                    {months.map((g) => {
                        const globalIndex = monthGroups.indexOf(g);
                        return (
                            <div
                                key={g.key}
                                className={`month-nav-item ${globalIndex === activeMonthIndex ? "active" : ""}`}
                                onClick={() => handleJumpToMonth(g)}
                            >
                                <span className="month-nav-dot" />
                                <div className="month-nav-label">
                                    <span className="month-nav-name">{g.label}</span>
                                    <span className="month-nav-count">{g.count}枚</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
};
