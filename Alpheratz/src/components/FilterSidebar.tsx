import { useEffect, useMemo, useRef, useState } from "react";

interface FilterSidebarProps {
    isOpen: boolean;
    activeFilterCount: number;
    filteredCount: number;
    worldFilters: string[];
    setWorldFilters: (vals: string[]) => void;
    worldNameList: string[];
    worldCounts: Record<string, number>;
    datePreset: "none" | "today" | "last7days" | "thisMonth" | "lastMonth" | "halfYear" | "oneYear" | "custom";
    onDatePresetSelect: (preset: "today" | "last7days" | "thisMonth" | "lastMonth" | "halfYear" | "oneYear") => void;
    dateFrom: string;
    setDateFrom: (val: string) => void;
    dateTo: string;
    setDateTo: (val: string) => void;
    orientationFilter: string;
    setOrientationFilter: (val: string) => void;
    orientationFilterDisabled?: boolean;
    favoritesOnly: boolean;
    setFavoritesOnly: (val: boolean) => void;
    tagFilters: string[];
    setTagFilters: (vals: string[]) => void;
    tagOptions: string[];
    onReset: () => void;
}

type CalendarCell = {
    key: string;
    date: Date;
    day: number;
    inCurrentMonth: boolean;
};

type FilterOption = {
    value: string;
    label: string;
    count?: number;
    isUnknown?: boolean;
};

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const parseDate = (value: string) => {
    if (!value) {
        return null;
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
        return null;
    }
    return new Date(year, month - 1, day);
};

const normalizeDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addMonths = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth() + offset, 1);

const isSameDay = (left: Date | null, right: Date | null) => (
    !!left
    && !!right
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
);

const isWithinRange = (date: Date, start: Date | null, end: Date | null) => {
    if (!start || !end) {
        return false;
    }
    return date >= start && date <= end;
};

const buildMonthCells = (monthDate: Date): CalendarCell[] => {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
            key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
            date,
            day: date.getDate(),
            inCurrentMonth: date.getMonth() === monthDate.getMonth(),
        };
    });
};

const getRangeLabel = (from: string, to: string) => {
    if (from && to) {
        return `${from} → ${to}`;
    }
    if (from) {
        return `${from} → ---`;
    }
    return "期間を選択...";
};

const toggleSelection = (values: string[], target: string) => (
    values.includes(target)
        ? values.filter((value) => value !== target)
        : [...values, target]
);

const getSelectionLabel = (items: string[], emptyLabel: string, suffix: string) => {
    if (items.length === 0) {
        return emptyLabel;
    }
    if (items.length === 1) {
        return items[0];
    }
    return `${items.length}${suffix}`;
};

export const FilterSidebar = ({
    isOpen,
    activeFilterCount,
    filteredCount,
    worldFilters,
    setWorldFilters,
    worldNameList,
    worldCounts,
    datePreset,
    onDatePresetSelect,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    orientationFilter,
    setOrientationFilter,
    orientationFilterDisabled = false,
    favoritesOnly,
    setFavoritesOnly,
    tagFilters,
    setTagFilters,
    tagOptions,
    onReset,
}: FilterSidebarProps) => {
    const sidebarRef = useRef<HTMLElement | null>(null);
    const worldDropdownRef = useRef<HTMLDivElement | null>(null);
    const tagDropdownRef = useRef<HTMLDivElement | null>(null);
    const datePickerRef = useRef<HTMLDivElement | null>(null);

    const [isWorldDropdownOpen, setIsWorldDropdownOpen] = useState(false);
    const [worldSearchQuery, setWorldSearchQuery] = useState("");
    const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
    const [tagSearchQuery, setTagSearchQuery] = useState("");
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [activeDateField, setActiveDateField] = useState<"from" | "to">("from");
    const [visibleMonth, setVisibleMonth] = useState(() => {
        const initial = parseDate(dateFrom) ?? new Date();
        return new Date(initial.getFullYear(), initial.getMonth(), 1);
    });
    const [draftFrom, setDraftFrom] = useState(dateFrom);
    const [draftTo, setDraftTo] = useState(dateTo);
    const [draftPreset, setDraftPreset] = useState<FilterSidebarProps["datePreset"]>(datePreset);

    useEffect(() => {
        setDraftFrom(dateFrom);
        setDraftTo(dateTo);
        setDraftPreset(datePreset);
    }, [dateFrom, dateTo, datePreset]);

    useEffect(() => {
        if (!isOpen) {
            setIsWorldDropdownOpen(false);
            setIsTagDropdownOpen(false);
            setIsDatePickerOpen(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isDatePickerOpen) {
            return;
        }
        const base = parseDate(draftFrom) ?? parseDate(dateFrom) ?? new Date();
        setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    }, [isDatePickerOpen, draftFrom, dateFrom]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (worldDropdownRef.current && !worldDropdownRef.current.contains(target)) {
                setIsWorldDropdownOpen(false);
                setWorldSearchQuery("");
            }
            if (tagDropdownRef.current && !tagDropdownRef.current.contains(target)) {
                setIsTagDropdownOpen(false);
                setTagSearchQuery("");
            }
            if (datePickerRef.current && !datePickerRef.current.contains(target)) {
                setIsDatePickerOpen(false);
                setDraftFrom(dateFrom);
                setDraftTo(dateTo);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [dateFrom, dateTo]);

    const activeStart = useMemo(() => parseDate(draftFrom), [draftFrom]);
    const activeEnd = useMemo(() => parseDate(draftTo), [draftTo]);

    const allWorldOptions = useMemo<FilterOption[]>(() => (
        worldNameList.map((name) => ({
            value: name || "unknown",
            label: name || "ワールド不明",
            isUnknown: !name,
            count: worldCounts[name || "unknown"] ?? 0,
        }))
    ), [worldCounts, worldNameList]);

    const filteredWorldOptions = useMemo(() => {
        const query = worldSearchQuery.trim().toLowerCase();
        if (!query) {
            return allWorldOptions;
        }
        return allWorldOptions.filter((option) => option.label.toLowerCase().includes(query));
    }, [allWorldOptions, worldSearchQuery]);

    const visitedWorldOptions = useMemo(
        () => filteredWorldOptions.filter((option) => !option.isUnknown),
        [filteredWorldOptions],
    );
    const otherWorldOptions = useMemo(
        () => filteredWorldOptions.filter((option) => option.isUnknown),
        [filteredWorldOptions],
    );

    const filteredTagOptions = useMemo(() => {
        const query = tagSearchQuery.trim().toLowerCase();
        if (!query) {
            return tagOptions;
        }
        return tagOptions.filter((tag) => tag.toLowerCase().includes(query));
    }, [tagOptions, tagSearchQuery]);

    const selectedWorldLabel = getSelectionLabel(
        worldFilters.map((value) => allWorldOptions.find((option) => option.value === value)?.label ?? value),
        "すべてのワールド",
        "件選択",
    );
    const selectedTagLabel = getSelectionLabel(tagFilters, "すべてのタグ", "件選択");

    const rangeLabel = getRangeLabel(dateFrom, dateTo);

    const months = useMemo(() => {
        const nextMonth = addMonths(visibleMonth, 1);
        return [visibleMonth, nextMonth].map((monthDate) => ({
            monthDate,
            cells: buildMonthCells(monthDate),
        }));
    }, [visibleMonth]);

    const applyPresetToDraft = (preset: Exclude<FilterSidebarProps["datePreset"], "none" | "custom">) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let from: Date;
        let to: Date;

        if (preset === "today") {
            from = today;
            to = today;
        } else if (preset === "last7days") {
            from = new Date(today);
            from.setDate(today.getDate() - 6);
            to = today;
        } else if (preset === "thisMonth") {
            from = new Date(today.getFullYear(), today.getMonth(), 1);
            to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (preset === "halfYear") {
            from = new Date(today);
            from.setMonth(today.getMonth() - 6);
            to = today;
        } else if (preset === "oneYear") {
            from = new Date(today);
            from.setFullYear(today.getFullYear() - 1);
            to = today;
        } else {
            from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            to = new Date(today.getFullYear(), today.getMonth(), 0);
        }

        setDraftPreset(preset);
        setDraftFrom(formatDate(from));
        setDraftTo(formatDate(to));
        setVisibleMonth(new Date(from.getFullYear(), from.getMonth(), 1));
    };

    const handleDateClick = (clickedDate: Date) => {
        const normalized = normalizeDate(clickedDate);
        const clicked = formatDate(normalized);
        setDraftPreset("custom");

        if (activeDateField === "from") {
            setDraftFrom(clicked);
            if (draftTo && clicked > draftTo) {
                setDraftTo("");
            }
            setActiveDateField("to");
            return;
        }

        if (draftFrom && clicked < draftFrom) {
            setDraftFrom(clicked);
            setDraftTo(draftFrom);
        } else {
            setDraftTo(clicked);
        }
    };

    const handleDateClear = () => {
        setDraftPreset("none");
        setDraftFrom("");
        setDraftTo("");
    };

    const handleDateApply = () => {
        setDateFrom(draftFrom);
        setDateTo(draftTo);
        if (draftPreset !== "custom" && draftPreset !== "none") {
            onDatePresetSelect(draftPreset);
        }
        if (draftPreset === "none") {
            setDateFrom("");
            setDateTo("");
        }
        setIsDatePickerOpen(false);
    };

    return (
        <aside ref={sidebarRef} className={`filter-sidebar ${isOpen ? "open" : ""}`}>
            <div className="fs-header">
                <div className="fs-title">
                    <h3>条件検索</h3>
                    {activeFilterCount > 0 && <span className="fs-badge">{activeFilterCount}</span>}
                </div>
                <button className="fs-reset" onClick={onReset}>
                    リセット
                </button>
            </div>

            <div className="fs-section">
                <label className="fs-label">ワールド</label>
                <div ref={worldDropdownRef} className="dd-wrap">
                    <button
                        type="button"
                        className={`dd-trigger ${isWorldDropdownOpen ? "open" : ""} ${worldFilters.length > 0 ? "active" : ""}`}
                        onClick={() => setIsWorldDropdownOpen((prev) => !prev)}
                    >
                        <span className="dd-icon">🌐</span>
                        <div className="dd-label-wrap">
                            <div className="dd-sublabel">ワールド</div>
                            <div className="dd-value">{selectedWorldLabel}</div>
                        </div>
                        <span className="dd-arrow">▼</span>
                    </button>

                    {isWorldDropdownOpen && (
                        <div className="dd-panel">
                            <div className="dd-search-wrap">
                                <span className="dd-search-icon">⌕</span>
                                <input
                                    className="dd-search"
                                    value={worldSearchQuery}
                                    placeholder="ワールド名で絞り込む..."
                                    onChange={(event) => setWorldSearchQuery(event.target.value)}
                                />
                            </div>
                            <div className="dd-list checkbox-list world-checkbox-list">
                                <label className="dd-check-item">
                                    <input
                                        type="checkbox"
                                        checked={worldFilters.length === 0}
                                        onChange={() => setWorldFilters([])}
                                    />
                                    <span className="dd-item-dot" />
                                    <span className="dd-item-name">すべてのワールド</span>
                                    <span className="dd-item-count">
                                        {Object.values(worldCounts).reduce((sum, count) => sum + count, 0)}枚
                                    </span>
                                </label>

                                {visitedWorldOptions.length > 0 && (
                                    <>
                                        <div className="dd-sep" />
                                        <div className="dd-group-label">訪問済みワールド</div>
                                        {visitedWorldOptions.map((option) => (
                                            <label key={option.value} className="dd-check-item">
                                                <input
                                                    type="checkbox"
                                                    checked={worldFilters.includes(option.value)}
                                                    onChange={() => setWorldFilters(toggleSelection(worldFilters, option.value))}
                                                />
                                                <span className="dd-item-dot" />
                                                <span className="dd-item-name">{option.label}</span>
                                                <span className="dd-item-count">{option.count}枚</span>
                                            </label>
                                        ))}
                                    </>
                                )}

                                {otherWorldOptions.length > 0 && (
                                    <>
                                        <div className="dd-sep" />
                                        <div className="dd-group-label">その他</div>
                                        {otherWorldOptions.map((option) => (
                                            <label key={option.value} className="dd-check-item unknown">
                                                <input
                                                    type="checkbox"
                                                    checked={worldFilters.includes(option.value)}
                                                    onChange={() => setWorldFilters(toggleSelection(worldFilters, option.value))}
                                                />
                                                <span className="dd-item-dot" />
                                                <span className="dd-item-name">{option.label}</span>
                                                <span className="dd-item-count">{option.count}枚</span>
                                            </label>
                                        ))}
                                    </>
                                )}
                            </div>
                            <div className="dd-footer">
                                <strong>{allWorldOptions.length}</strong> ワールド
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="fs-section">
                <label className="fs-label">撮影日</label>
                <div ref={datePickerRef} className="date-picker-wrap">
                    <button
                        type="button"
                        className={`date-trigger ${isDatePickerOpen ? "open" : ""} ${dateFrom || dateTo ? "has-value" : ""}`}
                        onClick={() => {
                            setDraftFrom(dateFrom);
                            setDraftTo(dateTo);
                            setDraftPreset(datePreset);
                            setIsDatePickerOpen((prev) => !prev);
                        }}
                    >
                        <span className="dt-cal-icon">📅</span>
                        <div className="dt-body">
                            <div className="dt-label">撮影日</div>
                            <div className={`dt-value ${dateFrom || dateTo ? "" : "placeholder"}`}>{rangeLabel}</div>
                        </div>
                        {(dateFrom || dateTo) && (
                            <span
                                className="dt-clear"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleDateClear();
                                }}
                            >
                                ×
                            </span>
                        )}
                    </button>

                    {isDatePickerOpen && (
                        <div className="cal-popup">
                            <div className="cal-top">
                                <div className="cal-top-label">
                                    <span>📅</span>
                                    <span className="cal-top-range">{rangeLabel}</span>
                                </div>
                                <div className="cal-top-hint">From / To を切り替えて選択します</div>
                            </div>

                            <div className="date-field-row">
                                <button
                                    type="button"
                                    className={`date-range-chip ${activeDateField === "from" ? "active" : ""}`}
                                    onClick={() => setActiveDateField("from")}
                                >
                                    <span className="date-range-chip-label">From</span>
                                    <span className="date-range-chip-value">{draftFrom || "---"}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`date-range-chip ${activeDateField === "to" ? "active" : ""}`}
                                    onClick={() => setActiveDateField("to")}
                                >
                                    <span className="date-range-chip-label">To</span>
                                    <span className="date-range-chip-value">{draftTo || "---"}</span>
                                </button>
                            </div>

                            <div className="cal-preset-grid">
                                <button type="button" className={`preset-btn ${draftPreset === "today" ? "active" : ""}`} onClick={() => applyPresetToDraft("today")}>今日</button>
                                <button type="button" className={`preset-btn ${draftPreset === "last7days" ? "active" : ""}`} onClick={() => applyPresetToDraft("last7days")}>直近7日</button>
                                <button type="button" className={`preset-btn ${draftPreset === "thisMonth" ? "active" : ""}`} onClick={() => applyPresetToDraft("thisMonth")}>今月</button>
                                <button type="button" className={`preset-btn ${draftPreset === "lastMonth" ? "active" : ""}`} onClick={() => applyPresetToDraft("lastMonth")}>先月</button>
                                <button type="button" className={`preset-btn ${draftPreset === "halfYear" ? "active" : ""}`} onClick={() => applyPresetToDraft("halfYear")}>半年</button>
                                <button type="button" className={`preset-btn ${draftPreset === "oneYear" ? "active" : ""}`} onClick={() => applyPresetToDraft("oneYear")}>一年</button>
                            </div>

                            <div className="cal-months single">
                                {months.slice(0, 1).map(({ monthDate, cells }) => (
                                    <div key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`} className="cal-month">
                                        <div className="cal-month-head">
                                            <button type="button" className="cal-nav" onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}>‹</button>
                                            <div className="cal-month-title">{monthDate.getFullYear()}年 {monthDate.getMonth() + 1}月</div>
                                            <button type="button" className="cal-nav" onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}>›</button>
                                        </div>

                                        <div className="cal-weekdays">
                                            {WEEK_LABELS.map((label, index) => (
                                                <div key={label} className={`cal-wd ${index === 0 ? "sun" : ""} ${index === 6 ? "sat" : ""}`}>{label}</div>
                                            ))}
                                        </div>

                                        <div className="cal-grid">
                                            {cells.map((cell, cellIndex) => {
                                                const cellDate = normalizeDate(cell.date);
                                                const isStart = isSameDay(cellDate, activeStart);
                                                const isEnd = isSameDay(cellDate, activeEnd);
                                                const isInRange = isWithinRange(cellDate, activeStart, activeEnd);
                                                const isToday = isSameDay(cellDate, normalizeDate(new Date()));
                                                const weekPosition = cellIndex % 7;

                                                return (
                                                    <button
                                                        key={cell.key}
                                                        type="button"
                                                        className={[
                                                            "cal-day",
                                                            !cell.inCurrentMonth ? "other" : "",
                                                            isToday ? "today" : "",
                                                            isInRange ? "in-range" : "",
                                                            isStart ? "range-start" : "",
                                                            isEnd ? "range-end" : "",
                                                            isInRange && weekPosition === 0 ? "row-first" : "",
                                                            isInRange && weekPosition === 6 ? "row-last" : "",
                                                        ].filter(Boolean).join(" ")}
                                                        onClick={() => handleDateClick(cell.date)}
                                                    >
                                                        {cell.day}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="cal-footer">
                                <button type="button" className="btn-clear" onClick={handleDateClear}>クリア</button>
                                <button type="button" className="btn-apply" onClick={handleDateApply}>確認</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="fs-section">
                <label className="fs-label">向き</label>
                <div className="toggle-group">
                    <button type="button" disabled={orientationFilterDisabled} className={`tg-btn ${orientationFilter === "all" ? "active" : ""}`} onClick={() => setOrientationFilter("all")}><span className="tg-icon">⊞</span>すべて</button>
                    <button type="button" disabled={orientationFilterDisabled} className={`tg-btn ${orientationFilter === "landscape" ? "active" : ""}`} onClick={() => setOrientationFilter("landscape")}><span className="tg-icon">⊟</span>横長</button>
                    <button type="button" disabled={orientationFilterDisabled} className={`tg-btn ${orientationFilter === "portrait" ? "active" : ""}`} onClick={() => setOrientationFilter("portrait")}><span className="tg-icon">▯</span>縦長</button>
                </div>
                {orientationFilterDisabled && (
                    <div className="fs-result">縦横分析が終わるまで選択できません</div>
                )}
            </div>

            <div className="fs-section">
                <label className="fs-label">タグ</label>
                <div ref={tagDropdownRef} className="dd-wrap">
                    <button
                        type="button"
                        className={`dd-trigger ${isTagDropdownOpen ? "open" : ""} ${tagFilters.length > 0 ? "active" : ""}`}
                        onClick={() => setIsTagDropdownOpen((prev) => !prev)}
                    >
                        <span className="dd-icon">#</span>
                        <div className="dd-label-wrap">
                            <div className="dd-sublabel">タグ</div>
                            <div className="dd-value">{selectedTagLabel}</div>
                        </div>
                        <span className="dd-arrow">▼</span>
                    </button>

                    {isTagDropdownOpen && (
                        <div className="dd-panel">
                            <div className="dd-search-wrap">
                                <span className="dd-search-icon">⌕</span>
                                <input
                                    className="dd-search"
                                    value={tagSearchQuery}
                                    placeholder="タグ名で絞り込む..."
                                    onChange={(event) => setTagSearchQuery(event.target.value)}
                                />
                            </div>
                            <div className="dd-list checkbox-list tag-checkbox-grid">
                                <label className="dd-check-item">
                                    <input
                                        type="checkbox"
                                        checked={tagFilters.length === 0}
                                        onChange={() => setTagFilters([])}
                                    />
                                    <span className="dd-item-dot" />
                                    <span className="dd-item-name">すべてのタグ</span>
                                </label>
                                {filteredTagOptions.map((tag) => (
                                    <label key={tag} className="dd-check-item">
                                        <input
                                            type="checkbox"
                                            checked={tagFilters.includes(tag)}
                                            onChange={() => setTagFilters(toggleSelection(tagFilters, tag))}
                                        />
                                        <span className="dd-item-dot" />
                                        <span className="dd-item-name">{tag}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="dd-footer">
                                <strong>{tagOptions.length}</strong> タグ
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="fs-section">
                <label className="fs-label">絞り込み</label>
                <label className={`fav-toggle ${favoritesOnly ? "active" : ""}`}>
                    <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
                    <span className="fav-star">★</span>
                    <span className="fav-text">お気に入りのみ</span>
                    <span className="fav-check">✓</span>
                </label>
            </div>

            <div className="fs-result">
                <strong>{filteredCount}枚</strong> 該当
            </div>
        </aside>
    );
};
