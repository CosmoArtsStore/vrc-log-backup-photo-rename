import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

import { usePhotos } from "./hooks/usePhotos";
import { useScan } from "./hooks/useScan";
import { useGridDimensions } from "./hooks/useGridDimensions";
import { useScroll } from "./hooks/useScroll";
import { useMonthGroups } from "./hooks/useMonthGroups";
import { useToasts } from "./hooks/useToasts";
import { usePhotoActions } from "./hooks/usePhotoActions";
import { usePhashWorker } from "./hooks/usePhashWorker";

import { Header } from "./components/Header";
import { MonthNav } from "./components/MonthNav";
import { PhotoGrid } from "./components/PhotoGrid";
import { PhotoModal } from "./components/PhotoModal";
import { SettingsModal } from "./components/SettingsModal";
import { FilterSidebar } from "./components/FilterSidebar";
import { ScanningOverlay } from "./components/ScanningOverlay";
import { EmptyState } from "./components/EmptyState";
import { Icons } from "./components/Icons";
import { DisplayPhotoItem, Photo } from "./types";
import { buildVirtualGalleryLayout } from "./components/galleryLayout";

const CARD_WIDTH = 270;
const ROW_HEIGHT = 246;
type DatePreset = "none" | "today" | "last7days" | "thisMonth" | "lastMonth" | "halfYear" | "oneYear" | "custom";
type ThemeMode = "light" | "dark";
type ViewMode = "standard" | "gallery";
type QuickActionMode = "idle" | "favorite" | "tag";
type GroupingMode = "none" | "similar" | "world";
type AppSetting = {
  photoFolderPath?: string;
  secondaryPhotoFolderPath?: string;
  enableStartup?: boolean;
  startupPreferenceSet?: boolean;
  themeMode?: ThemeMode;
  viewMode?: ViewMode;
};
type BackupCandidate = {
  photo_folder_path: string;
  backup_folder_name: string;
  created_at: string;
};
const SIMILAR_PHOTO_MAX_DISTANCE = 12;
const MAX_SIMILAR_PHOTOS_IN_MODAL = 60;

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getDateRangeFromPreset = (preset: Exclude<DatePreset, "none" | "custom">) => {
  const today = getToday();

  if (preset === "today") {
    const value = formatDate(today);
    return { from: value, to: value };
  }

  if (preset === "last7days") {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return { from: formatDate(from), to: formatDate(today) };
  }

  if (preset === "thisMonth") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: formatDate(from), to: formatDate(to) };
  }

  if (preset === "halfYear") {
    const from = new Date(today);
    from.setMonth(today.getMonth() - 6);
    return { from: formatDate(from), to: formatDate(today) };
  }

  if (preset === "oneYear") {
    const from = new Date(today);
    from.setFullYear(today.getFullYear() - 1);
    return { from: formatDate(from), to: formatDate(today) };
  }

  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth(), 0);
  return { from: formatDate(from), to: formatDate(to) };
};

const PDQ_HASH_HEX_RE = /^[0-9a-f]{64}$/i;

const parseHashVariants = (value?: string | null): string[] => (
  (value ?? "")
    .split("|")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => PDQ_HASH_HEX_RE.test(item))
);

const getPhotoHashVariants = (photo: Photo) => (
  Array.from(new Set(parseHashVariants(photo.phash)))
);

const getHammingDistance = (left: string, right: string) => {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number.parseInt(left[index], 16);
    const rightValue = Number.parseInt(right[index], 16);
    const xor = leftValue ^ rightValue;
    distance += xor.toString(2).split("1").length - 1;
  }
  return distance;
};

const getClosestHashDistance = (left: string[], right: string[]) => {
  if (left.length === 0 || right.length === 0) {
    return null;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const leftHash of left) {
    for (const rightHash of right) {
      const distance = getHammingDistance(leftHash, rightHash);
      if (distance < best) {
        best = distance;
      }
      if (best === 0) {
        return 0;
      }
    }
  }

  return Number.isFinite(best) ? best : null;
};

const buildAdjacentSimilarPhotoGroup = (photos: Photo[], anchorPhotoPath: string) => {
  const entries = photos.map((photo) => ({
    photo,
    hashes: getPhotoHashVariants(photo),
  }));
  const anchorIndex = entries.findIndex((entry) => entry.photo.photo_path === anchorPhotoPath);
  if (anchorIndex < 0) {
    return [];
  }

  let start = anchorIndex;
  while (start > 0) {
    const distance = getClosestHashDistance(entries[start].hashes, entries[start - 1].hashes);
    if (distance === null || distance > SIMILAR_PHOTO_MAX_DISTANCE) {
      break;
    }
    start -= 1;
  }

  let end = anchorIndex;
  while (end < entries.length - 1) {
    const distance = getClosestHashDistance(entries[end].hashes, entries[end + 1].hashes);
    if (distance === null || distance > SIMILAR_PHOTO_MAX_DISTANCE) {
      break;
    }
    end += 1;
  }

  return entries.slice(start, end + 1).map((entry) => entry.photo);
};

const buildWorldGroupedPhotos = (photos: Photo[]) => (
  photos
    .slice()
    .sort((left, right) => {
      const leftWorld = (left.world_name || "ワールド不明").toLocaleLowerCase("ja");
      const rightWorld = (right.world_name || "ワールド不明").toLocaleLowerCase("ja");
      if (leftWorld !== rightWorld) {
        return leftWorld.localeCompare(rightWorld, "ja");
      }
      return right.timestamp.localeCompare(left.timestamp);
    })
);

const buildAdjacentSimilarPhotoGroups = (photos: Photo[]) => {
  const groups: Photo[][] = [];
  let currentGroup: Photo[] = [];

  for (let index = 0; index < photos.length; index += 1) {
    const currentPhoto = photos[index];
    if (currentGroup.length === 0) {
      currentGroup = [currentPhoto];
      continue;
    }

    const previousPhoto = photos[index - 1];
    const distance = getClosestHashDistance(
      getPhotoHashVariants(previousPhoto),
      getPhotoHashVariants(currentPhoto),
    );

    if (distance !== null && distance <= SIMILAR_PHOTO_MAX_DISTANCE) {
      currentGroup.push(currentPhoto);
      continue;
    }

    groups.push(currentGroup);
    currentGroup = [currentPhoto];
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
};

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [worldFilters, setWorldFilters] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);
  const [pendingFolderSlot, setPendingFolderSlot] = useState<1 | 2>(1);
  const [pendingRestoreCandidate, setPendingRestoreCandidate] = useState<BackupCandidate | null>(null);
  const [isApplyingFolderChange, setIsApplyingFolderChange] = useState(false);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("none");
  const [orientationFilter, setOrientationFilter] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [masterTags, setMasterTags] = useState<string[]>([]);
  const [isExtensionOpen, setIsExtensionOpen] = useState(false);
  const [quickActionMode, setQuickActionMode] = useState<QuickActionMode>("idle");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("none");
  const [quickTagSelection, setQuickTagSelection] = useState("");
  const [quickTagDraft, setQuickTagDraft] = useState("");
  const [pendingQuickTagModal, setPendingQuickTagModal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount } = useGridDimensions(CARD_WIDTH);
  const { toasts, addToast } = useToasts();
  const { isRunning: isPhashRunning } = usePhashWorker();
  const photoFilters = useMemo(() => ({
    searchQuery: debouncedQuery,
    worldFilters,
    dateFrom,
    dateTo,
    orientationFilter,
    favoritesOnly,
    tagFilters,
  }), [debouncedQuery, worldFilters, dateFrom, dateTo, orientationFilter, favoritesOnly, tagFilters]);
  const { photos, setPhotos, loadPhotos, isLoading } = usePhotos(photoFilters, addToast);
  const {
    scanStatus,
    scanProgress,
    photoFolderPath,
    secondaryPhotoFolderPath,
    startScan,
    refreshSettings,
    cancelScan,
  } = useScan(addToast);

  const {
    selectedPhoto,
    setSelectedPhoto,
    closePhotoModal,
    photoHistory,
    goBackPhoto,
    localMemo,
    setLocalMemo,
    isSavingMemo,
    handleSaveMemo,
    handleOpenWorld,
    onSelectPhoto,
  } = usePhotoActions(setPhotos, addToast);

  const filteredPhotos = photos;
  const areAllPHashesReady = useMemo(
    () => photos.every((photo) => parseHashVariants(photo.phash).length > 0),
    [photos],
  );
  const isSimilarGroupingAvailable = !isPhashRunning && areAllPHashesReady;

  const displayPhotos = useMemo(() => {
    if (groupingMode === "world") {
      return buildWorldGroupedPhotos(filteredPhotos);
    }
    return filteredPhotos;
  }, [filteredPhotos, groupingMode]);

  const displayPhotoItems = useMemo<DisplayPhotoItem[]>(() => {
    if (groupingMode !== "similar") {
      return displayPhotos.map((photo) => ({ photo }));
    }

    return buildAdjacentSimilarPhotoGroups(displayPhotos).map((group) => ({
      photo: group[0],
      groupCount: group.length,
      groupPhotos: group,
    }));
  }, [displayPhotos, groupingMode]);

  const selectedPhotoView = useMemo(() => {
    if (!selectedPhoto) {
      return null;
    }
    return displayPhotos.find((photo) => photo.photo_path === selectedPhoto.photo_path)
      ?? photos.find((photo) => photo.photo_path === selectedPhoto.photo_path)
      ?? selectedPhoto;
  }, [selectedPhoto, displayPhotos, photos]);
  const selectedPhotoIndex = useMemo(() => (
    selectedPhotoView
      ? displayPhotoItems.findIndex((item) => (
        item.groupPhotos?.some((photo) => photo.photo_path === selectedPhotoView.photo_path)
        || item.photo.photo_path === selectedPhotoView.photo_path
      ))
      : -1
  ), [displayPhotoItems, selectedPhotoView]);
  const similarPhotos = useMemo(() => {
    if (groupingMode !== "similar" || !isSimilarGroupingAvailable || !selectedPhotoView) {
      return [];
    }
    return buildAdjacentSimilarPhotoGroup(filteredPhotos, selectedPhotoView.photo_path).slice(0, MAX_SIMILAR_PHOTOS_IN_MODAL);
  }, [groupingMode, isSimilarGroupingAvailable, filteredPhotos, selectedPhotoView]);

  useEffect(() => {
    if (!isSimilarGroupingAvailable && groupingMode === "similar") {
      setGroupingMode("none");
    }
  }, [isSimilarGroupingAvailable, groupingMode]);

  const updatePhoto = (photoPath: string, updater: (photo: Photo) => Photo) => {
    setPhotos((prev) => prev.map((photo) => (
      photo.photo_path === photoPath ? updater(photo) : photo
    )));
  };

  const toggleFavorite = async (photoPath: string, current: boolean) => {
    const currentPhoto = photos.find((photo) => photo.photo_path === photoPath);
    try {
      await invoke("set_photo_favorite_cmd", {
        photoPath,
        isFavorite: !current,
        sourceSlot: currentPhoto?.source_slot ?? 1,
      });
      updatePhoto(photoPath, (photo) => ({ ...photo, is_favorite: !current }));
    } catch (err) {
      addToast(`お気に入りの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const addTag = async (photoPath: string, tag: string) => {
    const normalized = tag.trim();
    if (!normalized) {
      return;
    }

    const currentPhoto = photos.find((photo) => photo.photo_path === photoPath);
    if (currentPhoto?.tags.includes(normalized)) {
      return;
    }

    try {
      await invoke("add_photo_tag_cmd", {
        photoPath,
        tag: normalized,
        sourceSlot: currentPhoto?.source_slot ?? 1,
      });
      updatePhoto(photoPath, (photo) => ({
        ...photo,
        tags: [...photo.tags, normalized].sort((left, right) => left.localeCompare(right, "ja")),
      }));
      addToast("タグを追加しました。");
    } catch (err) {
      addToast(`タグの追加に失敗しました: ${String(err)}`, "error");
    }
  };

  const removeTag = async (photoPath: string, tag: string) => {
    const currentPhoto = photos.find((photo) => photo.photo_path === photoPath);
    try {
      await invoke("remove_photo_tag_cmd", {
        photoPath,
        tag,
        sourceSlot: currentPhoto?.source_slot ?? 1,
      });
      updatePhoto(photoPath, (photo) => ({
        ...photo,
        tags: photo.tags.filter((item) => item !== tag),
      }));
      addToast("タグを削除しました。");
    } catch (err) {
      addToast(`タグの削除に失敗しました: ${String(err)}`, "error");
    }
  };

  const stopQuickAction = () => {
    setQuickActionMode("idle");
    setQuickTagSelection("");
    setQuickTagDraft("");
    setPendingQuickTagModal(false);
  };

  const startQuickFavorite = () => {
    if (quickActionMode === "favorite") {
      stopQuickAction();
      return;
    }
    setPendingQuickTagModal(false);
    setQuickTagSelection("");
    setQuickTagDraft("");
    setQuickActionMode("favorite");
  };

  const startQuickTag = () => {
    if (pendingQuickTagModal) {
      setPendingQuickTagModal(false);
      setQuickTagSelection("");
      setQuickTagDraft("");
      return;
    }
    if (quickActionMode === "tag") {
      stopQuickAction();
      return;
    }
    setPendingQuickTagModal(true);
    setQuickTagSelection("");
    setQuickTagDraft("");
  };

  const applyQuickTagMode = () => {
    const resolvedTag = quickTagDraft.trim() || quickTagSelection.trim();
    if (!resolvedTag) {
      addToast("クイックタグ付けに使うタグを選択してください。", "error");
      return;
    }
    setQuickTagSelection(resolvedTag);
    setQuickTagDraft("");
    setPendingQuickTagModal(false);
    setQuickActionMode("tag");
  };

  const handlePhotoActivate = async (item: DisplayPhotoItem) => {
    const photo = item.photo;
    if (quickActionMode === "favorite") {
      await toggleFavorite(photo.photo_path, photo.is_favorite);
      return;
    }

    if (quickActionMode === "tag") {
      if (!quickTagSelection) {
        addToast("クイックタグ付けのタグが未設定です。", "error");
        return;
      }
      if (photo.tags.includes(quickTagSelection)) {
        await removeTag(photo.photo_path, quickTagSelection);
        return;
      }
      await addTag(photo.photo_path, quickTagSelection);
      return;
    }

    onSelectPhoto(photo);
  };

  const resetFilters = () => {
    setWorldFilters([]);
    setDateFrom("");
    setDateTo("");
    setDatePreset("none");
    setOrientationFilter("all");
    setFavoritesOnly(false);
    setTagFilters([]);
  };

  const handleDatePresetSelect = (preset: Exclude<DatePreset, "none" | "custom">) => {
    const range = getDateRangeFromPreset(preset);
    setDatePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleDateFromChange = (value: string) => {
    setDatePreset("custom");
    setDateFrom(value);
  };

  const handleDateToChange = (value: string) => {
    setDatePreset("custom");
    setDateTo(value);
  };

  const galleryLayout = useMemo(
    () => buildVirtualGalleryLayout(displayPhotoItems.map((item) => item.photo), panelWidth, columnCount),
    [displayPhotoItems, panelWidth, columnCount],
  );

  const {
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
  } = useScroll({
    photosLength: displayPhotoItems.length,
    columnCount,
    gridHeight,
    ROW_HEIGHT,
    totalHeightOverride: viewMode === "gallery" ? galleryLayout.totalHeight : undefined,
  });

  const { monthGroups, monthsByYear, activeMonthIndex } = useMonthGroups(filteredPhotos, columnCount, scrollTop, ROW_HEIGHT);

  const finalizeFolderSelection = async (newPath: string, restoreBackup: boolean) => {
    setIsApplyingFolderChange(true);
    try {
      await invoke("save_setting_cmd", {
        setting: {
          photoFolderPath: pendingFolderSlot === 1 ? newPath : photoFolderPath,
          secondaryPhotoFolderPath: pendingFolderSlot === 2 ? newPath : secondaryPhotoFolderPath,
          enableStartup: startupEnabled,
          themeMode,
          viewMode,
        },
      });

      if (restoreBackup) {
        await invoke("restore_cache_backup_cmd", { photoFolderPath: newPath });
      }

      await refreshSettings();
      await loadPhotos();
      await startScan();
      setPendingRestoreCandidate(null);
      setPendingFolderPath(null);
      addToast(restoreBackup ? "バックアップデータを反映して再スキャンを開始します" : "写真フォルダを更新しました");
    } catch (err) {
      addToast(`写真フォルダの切替に失敗しました: ${String(err)}`, "error");
    } finally {
      setIsApplyingFolderChange(false);
    }
  };

  const applyFolderChange = async (newPath: string, resetExisting: boolean) => {
    setIsApplyingFolderChange(true);
    try {
      if (resetExisting) {
        if (photoFolderPath) {
          await invoke("create_cache_backup_cmd", { photoFolderPath });
        }
        await invoke("reset_photo_cache_cmd");
        setPhotos([]);
      }

      const backupCandidate = await invoke<BackupCandidate | null>("get_backup_candidate_cmd", {
        photoFolderPath: newPath,
      });
      setPendingFolderPath(null);
      if (backupCandidate) {
        setPendingRestoreCandidate(backupCandidate);
        addToast("関連するバックアップデータを検出しました。");
        return;
      }

      await finalizeFolderSelection(newPath, false);
    } catch (err) {
      addToast(`写真フォルダの更新に失敗しました: ${String(err)}`, "error");
    } finally {
      setIsApplyingFolderChange(false);
    }
  };

  const handleChooseFolder = async (slot: 1 | 2) => {
    try {
      const selected = await open({ directory: true });
      if (!selected) {
        return;
      }

      const newPath = Array.isArray(selected) ? selected[0] : selected;
      const currentPath = slot === 1 ? photoFolderPath : secondaryPhotoFolderPath;
      if (newPath === currentPath) {
        return;
      }
      if (slot === 1 && photoFolderPath) {
        setPendingFolderSlot(1);
        setPendingFolderPath(newPath);
        return;
      }

      if (slot === 2) {
        await invoke("save_setting_cmd", {
          setting: {
            photoFolderPath,
            secondaryPhotoFolderPath: newPath,
            enableStartup: startupEnabled,
            themeMode,
            viewMode,
          },
        });
        await refreshSettings();
        await loadPhotos();
        await startScan();
        addToast("2nd 参照フォルダを更新しました");
        return;
      }

      await applyFolderChange(newPath, false);
    } catch (err) {
      addToast(`写真フォルダの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleStartupPreference = async (enabled: boolean) => {
    try {
      await invoke("save_startup_preference_cmd", { enabled });
      setStartupEnabled(enabled);
      addToast(enabled ? "Alpheratz をログイン時に起動する設定にしました。" : "Alpheratz のログイン時起動を無効にしました。");
    } catch (err) {
      addToast(`自動起動設定の更新に失敗しました: ${String(err)}`, "error");
    }
  };

  useEffect(() => {
    const loadAppSetting = async () => {
      try {
        const setting = await invoke<AppSetting>("get_setting_cmd");
        setStartupEnabled(!!setting.enableStartup);
        setThemeMode(setting.themeMode === "dark" ? "dark" : "light");
        setViewMode(setting.viewMode === "gallery" ? "gallery" : "standard");
        await loadMasterTags();
      } catch (err) {
        addToast(`設定の読み込みに失敗しました: ${String(err)}`, "error");
      }
    };

    loadAppSetting();
  }, []);

  const handleThemeToggle = async () => {
    const nextTheme: ThemeMode = themeMode === "dark" ? "light" : "dark";
    try {
      await invoke("save_setting_cmd", {
        setting: {
          photoFolderPath,
          secondaryPhotoFolderPath,
          enableStartup: startupEnabled,
          themeMode: nextTheme,
          viewMode,
        },
      });
      setThemeMode(nextTheme);
    } catch (err) {
      addToast(`テーマ設定の更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const loadMasterTags = async () => {
    try {
      const tags = await invoke<string[]>("get_all_tags_cmd");
      setMasterTags(tags);
    } catch (err) {
      addToast(`タグマスタの読み込みに失敗しました: ${String(err)}`, "error");
    }
  };

  const createTagMaster = async (tag: string) => {
    const normalized = tag.trim();
    if (!normalized) {
      return;
    }

    try {
      await invoke("create_tag_master_cmd", { tag: normalized });
      await loadMasterTags();
      addToast("タグマスタを追加しました。");
    } catch (err) {
      addToast(`タグマスタの追加に失敗しました: ${String(err)}`, "error");
    }
  };

  const deleteTagMaster = async (tag: string) => {
    try {
      await invoke("delete_tag_master_cmd", { tag });
      await loadMasterTags();
      addToast("タグマスタを削除しました。");
    } catch (err) {
      addToast(`タグマスタの削除に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleViewModeChange = async (nextViewMode: ViewMode) => {
    try {
      await invoke("save_setting_cmd", {
        setting: {
          photoFolderPath,
          secondaryPhotoFolderPath,
          enableStartup: startupEnabled,
          themeMode,
          viewMode: nextViewMode,
        },
      });
      setViewMode(nextViewMode);
    } catch (err) {
      addToast(`表示形式の更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const worldNameList = useMemo(
    () => Array.from(new Set(photos.map((photo) => photo.world_name || ""))).sort(),
    [photos],
  );
  const worldCounts = useMemo(() => (
    photos.reduce<Record<string, number>>((acc, photo) => {
      const key = photo.world_name || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ), [photos]);
  const tagOptions = useMemo(() => (
    masterTags.slice().sort((left, right) => left.localeCompare(right, "ja"))
  ), [masterTags]);
  const hasMasterTags = tagOptions.length > 0;
  const quickActionHint = useMemo(() => {
    if (quickActionMode === "favorite") {
      return "お気に入りにする画像を選択してください";
    }
    if (quickActionMode === "tag") {
      return `「${quickTagSelection}」を付ける画像を選択してください`;
    }
    return null;
  }, [quickActionMode, quickTagSelection]);
  const activeFilterCount = useMemo(() => (
    [
      worldFilters.length > 0,
      !!dateFrom || !!dateTo,
      orientationFilter !== "all",
      favoritesOnly,
      tagFilters.length > 0,
    ].filter(Boolean).length
  ), [worldFilters, dateFrom, dateTo, orientationFilter, favoritesOnly, tagFilters]);
  const cellProps = useMemo(
    () => ({ data: displayPhotoItems, onSelect: handlePhotoActivate, columnCount }),
    [displayPhotoItems, columnCount, handlePhotoActivate],
  );
  const displayTotalRows = Math.ceil(displayPhotoItems.length / columnCount);

  return (
    <div className={`alpheratz-root ${themeMode === "dark" ? "theme-dark" : "theme-light"}`}>
      <Header
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        isExtensionOpen={isExtensionOpen}
        setIsExtensionOpen={setIsExtensionOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {isExtensionOpen && (
        <div className="extension-toolbar">
          <div className="extension-toolbar-title">拡張機能</div>
          <div className="extension-toolbar-actions">
            <div className="toolbar-group">
              <span className="toolbar-group-label">クイック操作</span>
              <div className="toolbar-group-actions">
                <button
                  className={`extension-toolbar-button ${quickActionMode === "favorite" ? "active" : ""}`}
                  onClick={startQuickFavorite}
                  type="button"
                >
                  お気に入り
                </button>
                <button
                  className={`extension-toolbar-button ${quickActionMode === "tag" || pendingQuickTagModal ? "active" : ""}`}
                  onClick={startQuickTag}
                  type="button"
                >
                  タグ
                </button>
              </div>
            </div>
            <div className="toolbar-group">
              <span className="toolbar-group-label">グループ</span>
              <div className="toolbar-group-actions">
                <button
                  className={`extension-toolbar-button ${groupingMode === "none" ? "active" : ""}`}
                  onClick={() => setGroupingMode("none")}
                  type="button"
                >
                  なし
                </button>
                <button
                  className={`extension-toolbar-button ${groupingMode === "similar" ? "active" : ""}`}
                  onClick={() => setGroupingMode("similar")}
                  disabled={!isSimilarGroupingAvailable}
                  title={isSimilarGroupingAvailable ? "隣接画像の類似度でまとめる" : "pHash 計算が完了するまで使えません"}
                  type="button"
                >
                  似た写真
                </button>
                <button
                  className={`extension-toolbar-button ${groupingMode === "world" ? "active" : ""}`}
                  onClick={() => setGroupingMode("world")}
                  type="button"
                >
                  ワールド
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className={`main-content ${isFilterOpen ? "filter-open" : ""}`}>
        {scanStatus === "scanning" && (
          <ScanningOverlay
            progress={scanProgress}
            title="スキャン中..."
            description="一覧表示に必要な情報を取り込んでいます"
            onCancel={cancelScan}
            canCancel={true}
          />
        )}
        {isFilterOpen && <button className="filter-backdrop" onClick={() => setIsFilterOpen(false)} aria-label="絞り込みを閉じる" />}
        <FilterSidebar
          isOpen={isFilterOpen}
          activeFilterCount={activeFilterCount}
          filteredCount={filteredPhotos.length}
          worldFilters={worldFilters}
          setWorldFilters={setWorldFilters}
          worldNameList={worldNameList}
          worldCounts={worldCounts}
          datePreset={datePreset}
          onDatePresetSelect={handleDatePresetSelect}
          dateFrom={dateFrom}
          setDateFrom={handleDateFromChange}
          dateTo={dateTo}
          setDateTo={handleDateToChange}
          orientationFilter={orientationFilter}
          setOrientationFilter={setOrientationFilter}
          orientationFilterDisabled={false}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          tagFilters={tagFilters}
          setTagFilters={setTagFilters}
          tagOptions={tagOptions}
          onReset={resetFilters}
        />
        <div className="grid-area">
          {viewMode === "standard" && groupingMode === "none" && (
            <MonthNav
              monthsByYear={monthsByYear}
              monthGroups={monthGroups}
              activeMonthIndex={activeMonthIndex}
              handleJumpToMonth={(group) => handleJumpToRow(group.rowIndex)}
            />
          )}

          <div className="right-panel" ref={rightPanelRef}>
            {quickActionHint && (
              <div className="quick-action-tooltip" role="status" aria-live="polite">
                {quickActionHint}
              </div>
            )}
            {(scanStatus !== "scanning" && !isLoading && filteredPhotos.length === 0) && (
              <EmptyState
                isFiltering={
                  !!searchQuery
                  || worldFilters.length > 0
                  || !!dateFrom
                  || !!dateTo
                  || favoritesOnly
                  || tagFilters.length > 0
                  || orientationFilter !== "all"
                }
              />
            )}

            <div ref={gridWrapperRef} style={{ flex: 1, minHeight: 0 }}>
              <PhotoGrid
                photos={displayPhotoItems}
                viewMode={viewMode}
                quickActionMode={quickActionMode}
                scrollTop={scrollTop}
                columnCount={columnCount}
                CARD_WIDTH={CARD_WIDTH}
                totalRows={displayTotalRows}
                ROW_HEIGHT={ROW_HEIGHT}
                gridHeight={gridHeight}
                panelWidth={panelWidth}
                handleGridScroll={handleGridScroll}
                handleGridWheel={handleGridWheel}
                isDragging={isDragging}
                thumbTop={thumbTop}
                thumbHeight={thumbHeight}
                handleTrackClick={handleTrackClick}
                handleScrollbarMouseDown={handleScrollbarMouseDown}
                totalHeight={totalHeight}
                galleryLayout={galleryLayout}
                cellProps={{ ...cellProps, data: displayPhotoItems }}
                onGridRef={onGridRef}
              />
            </div>
          </div>

          <aside className="right-rail" aria-label="表示操作">
            <div className="right-rail-spacer" />
            <div className="right-rail-controls">
              <div className="right-rail-group">
                <button
                  className={`right-rail-button ${viewMode === "standard" ? "active" : ""}`}
                  onClick={() => void handleViewModeChange("standard")}
                  aria-label="標準グリッド"
                  title="標準グリッド"
                  type="button"
                >
                  <span className="right-rail-icon"><span>▦</span></span>
                </button>
                <button
                  className={`right-rail-button ${viewMode === "gallery" ? "active" : ""}`}
                  onClick={() => void handleViewModeChange("gallery")}
                  aria-label="ギャラリー"
                  title="ギャラリー"
                  type="button"
                >
                  <span className="right-rail-icon"><span>▥</span></span>
                </button>
              </div>
              <div className="right-rail-divider" />
              <button
                className="right-rail-button"
                onClick={() => {
                  if (scanStatus === "scanning") {
                    cancelScan();
                    return;
                  }
                  void startScan();
                }}
                aria-label={scanStatus === "scanning" ? "スキャンを中止" : "再読み込み"}
                title={scanStatus === "scanning" ? "スキャンを中止" : "再読み込み"}
                type="button"
              >
                <span className="right-rail-icon">{scanStatus === "scanning" ? "×" : "↻"}</span>
              </button>
              <button
                className="right-rail-button"
                onClick={() => setShowSettings(true)}
                aria-label="設定"
                title="設定"
                type="button"
              >
                <Icons.Settings />
              </button>
            </div>
          </aside>
        </div>
      </main>

      {pendingQuickTagModal && (
        <div className="modal-overlay" onClick={() => setPendingQuickTagModal(false)}>
          <div className="modal-content quick-tag-modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setPendingQuickTagModal(false)}
              aria-label="閉じる"
            >
              ×
            </button>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="modal-info">
                <div className="info-header">
                  <h2>クイックタグ付け</h2>
                </div>
                <div className="quick-tag-modal-body">
                  <p>写真クリック時に即時追加するタグを選択してください。</p>
                  <label className="quick-tag-modal-label" htmlFor="quick-tag-select">既存タグ</label>
                  <div className="tag-select-wrap">
                    <select
                      id="quick-tag-select"
                      className="tag-select"
                      value={quickTagSelection}
                      disabled={!hasMasterTags}
                      onChange={(event) => setQuickTagSelection(event.target.value)}
                    >
                      <option value="">{hasMasterTags ? "タグを選択..." : "タグが登録されていません"}</option>
                      {tagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="quick-tag-modal-label" htmlFor="quick-tag-draft">新規タグ</label>
                  <input
                    id="quick-tag-draft"
                    className="quick-tag-input"
                    value={quickTagDraft}
                    onChange={(event) => setQuickTagDraft(event.target.value)}
                    placeholder="新しいタグを入力..."
                    />
                  {!hasMasterTags && (
                    <div className="tag-select-empty-note">
                      タグが登録されていません。設定画面でタグを追加してください。
                    </div>
                  )}
                </div>
                <div className="folder-change-actions">
                  <button
                    className="header-icon-button"
                    onClick={() => setPendingQuickTagModal(false)}
                  >
                    キャンセル
                  </button>
                  <button
                    className="world-link-button"
                    onClick={applyQuickTagMode}
                  >
                    開始
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedPhotoView && (
        <PhotoModal
          photo={selectedPhotoView}
          allTags={masterTags}
          onClose={closePhotoModal}
          localMemo={localMemo}
          setLocalMemo={setLocalMemo}
          handleSaveMemo={handleSaveMemo}
          isSavingMemo={isSavingMemo}
          handleOpenWorld={handleOpenWorld}
          canGoBack={photoHistory.length > 0}
          onGoBack={goBackPhoto}
          canGoPrev={selectedPhotoIndex > 0}
          canGoNext={selectedPhotoIndex >= 0 && selectedPhotoIndex < displayPhotoItems.length - 1}
          onGoPrev={() => {
            if (selectedPhotoIndex > 0) {
              const previousItem = displayPhotoItems[selectedPhotoIndex - 1];
              setSelectedPhoto(previousItem.photo);
            }
          }}
          onGoNext={() => {
            if (selectedPhotoIndex >= 0 && selectedPhotoIndex < displayPhotoItems.length - 1) {
              const nextItem = displayPhotoItems[selectedPhotoIndex + 1];
              setSelectedPhoto(nextItem.photo);
            }
          }}
          similarPhotos={similarPhotos}
          showSimilarPhotos={groupingMode === "similar"}
          onSelectSimilarPhoto={setSelectedPhoto}
          onToggleFavorite={() => toggleFavorite(selectedPhotoView.photo_path, selectedPhotoView.is_favorite)}
          onAddTag={(tag) => addTag(selectedPhotoView.photo_path, tag)}
          onRemoveTag={(tag) => removeTag(selectedPhotoView.photo_path, tag)}
          addToast={addToast}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          photoFolderPath={photoFolderPath}
          secondaryPhotoFolderPath={secondaryPhotoFolderPath}
          handleChooseFolder={handleChooseFolder}
          startupEnabled={startupEnabled}
          onToggleStartup={() => handleStartupPreference(!startupEnabled)}
          themeMode={themeMode}
          onToggleTheme={handleThemeToggle}
          masterTags={masterTags}
          onCreateTagMaster={createTagMaster}
          onDeleteTagMaster={deleteTagMaster}
        />
      )}
      {pendingFolderPath && (
        <div className="modal-overlay" onClick={() => !isApplyingFolderChange && setPendingFolderPath(null)}>
          <div className="modal-content settings-panel folder-change-modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => !isApplyingFolderChange && setPendingFolderPath(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="modal-info">
                <div className="info-header"><h2>フォルダ変更の確認</h2></div>
                <div className="folder-change-warning">
                  <strong>現在のデータはすべてリセットされます。</strong>
                  <p>写真一覧、タグ、お気に入り、メモ、サムネイルキャッシュ、ログを削除してから新しいフォルダをスキャンします。</p>
                  <p>変更先: {pendingFolderPath}</p>
                </div>
                <div className="folder-change-actions">
                  <button
                    className="header-icon-button"
                    onClick={() => setPendingFolderPath(null)}
                    disabled={isApplyingFolderChange}
                  >
                    キャンセル
                  </button>
                  <button
                    className="world-link-button"
                    onClick={() => void applyFolderChange(pendingFolderPath, true)}
                    disabled={isApplyingFolderChange}
                  >
                    {isApplyingFolderChange ? "切替中..." : "リセットして続行"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {pendingRestoreCandidate && (
        <div className="modal-overlay" onClick={() => !isApplyingFolderChange && setPendingRestoreCandidate(null)}>
          <div className="modal-content settings-panel folder-change-modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => !isApplyingFolderChange && setPendingRestoreCandidate(null)}
              aria-label="閉じる"
            >
              ×
            </button>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="modal-info">
                <div className="info-header"><h2>バックアップデータの確認</h2></div>
                <div className="folder-change-warning backup-restore-warning">
                  <strong>バックアップデータがあります。反映させますか？</strong>
                  <p>対象パス: {pendingRestoreCandidate.photo_folder_path}</p>
                  <p>バックアップ作成日時: {pendingRestoreCandidate.created_at}</p>
                  <p>※ 復元できるデータは、ファイル名が DB と一致しているデータに限ります。</p>
                </div>
                <div className="folder-change-actions">
                  <button
                    className="header-icon-button"
                    onClick={() => void finalizeFolderSelection(pendingRestoreCandidate.photo_folder_path, false)}
                    disabled={isApplyingFolderChange}
                  >
                    使わない
                  </button>
                  <button
                    className="world-link-button"
                    onClick={() => void finalizeFolderSelection(pendingRestoreCandidate.photo_folder_path, true)}
                    disabled={isApplyingFolderChange}
                  >
                    {isApplyingFolderChange ? "反映中..." : "反映する"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <div className="toast-icon">★</div>
            <div className="toast-msg">{toast.msg}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
