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
type GroupingMode = "none" | "similar" | "world";
type AppSetting = {
  photoFolderPath?: string;
  secondaryPhotoFolderPath?: string;
  enableStartup?: boolean;
  startupPreferenceSet?: boolean;
  themeMode?: ThemeMode;
  viewMode?: ViewMode;
  tweetTemplates?: string[];
  activeTweetTemplate?: string;
};
type BackupCandidate = {
  photo_folder_path: string;
  backup_folder_name: string;
  created_at: string;
};
// Tuned against F:\bk_photo poster samples while avoiding chain-merging unrelated neighbors.
const SIMILAR_PHOTO_MAX_DISTANCE = 124;
const MAX_SIMILAR_PHOTOS_IN_MODAL = 24;
const DEFAULT_TWEET_TEMPLATES = [
  [
    "おは{world-name}",
    "",
    "#{タグを追加}",
  ].join("\n"),
  [
    "World: {world-name}",
    "Author:",
    "",
    "#VRChat_world紹介",
  ].join("\n"),
  [
    "World: {world-name}",
    "Author:",
    "Cloth:",
    "",
    "#VRChatPhotography",
  ].join("\n"),
];
const DEFAULT_TWEET_TEMPLATE = DEFAULT_TWEET_TEMPLATES[0];

const replaceTemplateToken = (template: string, token: string, value: string) => (
  template.split(token).join(value)
);

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

const normalizeWorldName = (value?: string | null) => (value ?? "").trim().toLocaleLowerCase("ja");

const canGroupByPhotoMeta = (left: Photo, right: Photo) => {
  const leftWorld = normalizeWorldName(left.world_name);
  const rightWorld = normalizeWorldName(right.world_name);

  if (leftWorld && rightWorld && leftWorld !== rightWorld) {
    return false;
  }

  const leftOrientation = left.orientation ?? "unknown";
  const rightOrientation = right.orientation ?? "unknown";
  if (leftOrientation !== "unknown" && rightOrientation !== "unknown" && leftOrientation !== rightOrientation) {
    return false;
  }

  if ((left.source_slot ?? 1) !== (right.source_slot ?? 1)) {
    return false;
  }

  return true;
};

const areAdjacentPhotosSimilar = (left: Photo, right: Photo) => {
  if (!canGroupByPhotoMeta(left, right)) {
    return false;
  }

  const distance = getClosestHashDistance(
    getPhotoHashVariants(left),
    getPhotoHashVariants(right),
  );

  return distance !== null && distance <= SIMILAR_PHOTO_MAX_DISTANCE;
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
    const previousPhoto = entries[start - 1].photo;
    const currentPhoto = entries[start].photo;
    const anchorPhoto = entries[anchorIndex].photo;
    if (
      !areAdjacentPhotosSimilar(previousPhoto, currentPhoto)
      || !areAdjacentPhotosSimilar(previousPhoto, anchorPhoto)
    ) {
      break;
    }
    start -= 1;
  }

  let end = anchorIndex;
  while (end < entries.length - 1) {
    const currentPhoto = entries[end].photo;
    const nextPhoto = entries[end + 1].photo;
    const anchorPhoto = entries[anchorIndex].photo;
    if (
      !areAdjacentPhotosSimilar(currentPhoto, nextPhoto)
      || !areAdjacentPhotosSimilar(nextPhoto, anchorPhoto)
    ) {
      break;
    }
    end += 1;
  }

  return entries.slice(start, end + 1).map((entry) => entry.photo);
};

const buildWorldGroupedPhotoItems = (photos: Photo[]): DisplayPhotoItem[] => {
  const groups = new Map<string, Photo[]>();

  for (const photo of photos) {
    const key = photo.world_name?.trim() || "ワールド不明";
    const current = groups.get(key);
    if (current) {
      current.push(photo);
    } else {
      groups.set(key, [photo]);
    }
  }

  return Array.from(groups.entries())
    .sort(([leftWorld, leftPhotos], [rightWorld, rightPhotos]) => {
      const worldCompare = leftWorld.localeCompare(rightWorld, "ja");
      if (worldCompare !== 0) {
        return worldCompare;
      }
      const leftTimestamp = leftPhotos[0]?.timestamp ?? "";
      const rightTimestamp = rightPhotos[0]?.timestamp ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    })
    .map(([, group]) => {
      const sortedGroup = group.slice().sort((left, right) => right.timestamp.localeCompare(left.timestamp));
      return {
        photo: sortedGroup[0],
        groupCount: sortedGroup.length,
        groupPhotos: sortedGroup,
      };
    });
};

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
    const anchorPhoto = currentGroup[0];

    if (
      areAdjacentPhotosSimilar(previousPhoto, currentPhoto)
      && areAdjacentPhotosSimilar(anchorPhoto, currentPhoto)
    ) {
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
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("none");
  const [selectedPhotoPaths, setSelectedPhotoPaths] = useState<string[]>([]);
  const [selectionAnchorPhotoPath, setSelectionAnchorPhotoPath] = useState<string | null>(null);
  const [bulkTagSelection, setBulkTagSelection] = useState("");
  const [bulkTagDraft, setBulkTagDraft] = useState("");
  const [isBulkTagModalOpen, setIsBulkTagModalOpen] = useState(false);
  const [tweetTemplates, setTweetTemplates] = useState<string[]>([DEFAULT_TWEET_TEMPLATE]);
  const [activeTweetTemplate, setActiveTweetTemplate] = useState(DEFAULT_TWEET_TEMPLATE);
  const [isTweetTemplatePanelOpen, setIsTweetTemplatePanelOpen] = useState(false);
  const [tweetTemplateDraft, setTweetTemplateDraft] = useState("");
  const [editingTweetTemplate, setEditingTweetTemplate] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { rightPanelRef, gridWrapperRef, panelWidth, gridHeight, columnCount } = useGridDimensions(CARD_WIDTH);
  const { toasts, addToast } = useToasts();
  const { progress: similarPrepProgress, isRunning: isPhashRunning } = usePhashWorker();
  const photoFilters = useMemo(() => ({
    searchQuery: debouncedQuery,
    worldFilters,
    dateFrom,
    dateTo,
    orientationFilter,
    favoritesOnly,
    tagFilters,
    includePhash: groupingMode === "similar",
  }), [debouncedQuery, worldFilters, dateFrom, dateTo, orientationFilter, favoritesOnly, tagFilters, groupingMode]);
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

  const displayPhotos = useMemo(() => filteredPhotos, [filteredPhotos]);
  const selectedPhotoPathSet = useMemo(() => new Set(selectedPhotoPaths), [selectedPhotoPaths]);

  const displayPhotoItems = useMemo<DisplayPhotoItem[]>(() => {
    if (groupingMode === "world") {
      return buildWorldGroupedPhotoItems(displayPhotos);
    }

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

  useEffect(() => {
    setSelectedPhotoPaths((prev) => prev.filter((photoPath) => photos.some((photo) => photo.photo_path === photoPath)));
  }, [photos]);

  useEffect(() => {
    if (selectionAnchorPhotoPath && !photos.some((photo) => photo.photo_path === selectionAnchorPhotoPath)) {
      setSelectionAnchorPhotoPath(null);
    }
  }, [photos, selectionAnchorPhotoPath]);

  const updatePhoto = (photoPath: string, updater: (photo: Photo) => Photo) => {
    setPhotos((prev) => prev.map((photo) => (
      photo.photo_path === photoPath ? updater(photo) : photo
    )));
  };

  const buildSettingPayload = (overrides: Partial<AppSetting> = {}): AppSetting => ({
    photoFolderPath,
    secondaryPhotoFolderPath,
    enableStartup: startupEnabled,
    themeMode,
    viewMode,
    tweetTemplates,
    activeTweetTemplate,
    ...overrides,
  });

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

  const toggleSelectedPhoto = (item: DisplayPhotoItem, shiftKey: boolean) => {
    const photoPath = item.photo.photo_path;
    if (shiftKey && selectionAnchorPhotoPath) {
      const anchorIndex = displayPhotoItems.findIndex((entry) => entry.photo.photo_path === selectionAnchorPhotoPath);
      const targetIndex = displayPhotoItems.findIndex((entry) => entry.photo.photo_path === photoPath);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const startIndex = Math.min(anchorIndex, targetIndex);
        const endIndex = Math.max(anchorIndex, targetIndex);
        const rangePhotoPaths = displayPhotoItems
          .slice(startIndex, endIndex + 1)
          .map((entry) => entry.photo.photo_path);

        setSelectedPhotoPaths((prev) => Array.from(new Set([...prev, ...rangePhotoPaths])));
        setSelectionAnchorPhotoPath(photoPath);
        return;
      }
    }

    setSelectedPhotoPaths((prev) => (
      prev.includes(photoPath)
        ? prev.filter((currentPath) => currentPath !== photoPath)
        : [...prev, photoPath]
    ));
    setSelectionAnchorPhotoPath(photoPath);
  };

  const clearSelectedPhotos = () => {
    setSelectedPhotoPaths([]);
    setSelectionAnchorPhotoPath(null);
  };

  const handlePhotoActivate = (item: DisplayPhotoItem) => {
    onSelectPhoto(item.photo);
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
  const standardColumnWidth = useMemo(
    () => Math.max(CARD_WIDTH, Math.floor(panelWidth / Math.max(1, columnCount))),
    [panelWidth, columnCount],
  );

  const {
    scrollTop,
    totalHeight,
    onGridRef,
    handleGridScroll,
    handleGridWheel,
    handleJumpToRatio,
    maxScrollTop,
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
        setting: buildSettingPayload({
          photoFolderPath: pendingFolderSlot === 1 ? newPath : photoFolderPath,
          secondaryPhotoFolderPath: pendingFolderSlot === 2 ? newPath : secondaryPhotoFolderPath,
        }),
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
          setting: buildSettingPayload({
            secondaryPhotoFolderPath: newPath,
          }),
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
        const resolvedTemplates = setting.tweetTemplates && setting.tweetTemplates.length > 0
          ? setting.tweetTemplates
          : DEFAULT_TWEET_TEMPLATES;
        const resolvedActiveTemplate = resolvedTemplates.includes(setting.activeTweetTemplate ?? "")
          ? setting.activeTweetTemplate ?? DEFAULT_TWEET_TEMPLATE
          : resolvedTemplates[0];
        setTweetTemplates(resolvedTemplates);
        setActiveTweetTemplate(resolvedActiveTemplate);
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
        setting: buildSettingPayload({
          themeMode: nextTheme,
        }),
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
        setting: buildSettingPayload({
          viewMode: nextViewMode,
        }),
      });
      setViewMode(nextViewMode);
    } catch (err) {
      addToast(`表示形式の更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleAddTweetTemplate = async (template: string) => {
    const normalized = template.trim();
    if (!normalized) {
      addToast("ツイートテンプレートを入力してください。", "error");
      return;
    }

    if (tweetTemplates.includes(normalized)) {
      addToast("同じテンプレートは登録済みです。", "error");
      return;
    }

    const nextTemplates = [...tweetTemplates, normalized];
    try {
      await invoke("save_setting_cmd", {
        setting: buildSettingPayload({
          tweetTemplates: nextTemplates,
          activeTweetTemplate: activeTweetTemplate || normalized,
        }),
      });
      setTweetTemplates(nextTemplates);
      if (!activeTweetTemplate) {
        setActiveTweetTemplate(normalized);
      }
      addToast("ツイートテンプレートを登録しました。");
    } catch (err) {
      addToast(`ツイートテンプレートの保存に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleStartTweetTemplateEdit = (template: string) => {
    setEditingTweetTemplate(template);
    setTweetTemplateDraft(template);
  };

  const handleCancelTweetTemplateEdit = () => {
    setEditingTweetTemplate(null);
    setTweetTemplateDraft("");
  };

  const handleSaveTweetTemplate = async () => {
    const normalized = tweetTemplateDraft.trim();
    if (!normalized) {
      addToast("ツイートテンプレートを入力してください。", "error");
      return;
    }

    if (!editingTweetTemplate) {
      await handleAddTweetTemplate(normalized);
      setTweetTemplateDraft("");
      return;
    }

    if (editingTweetTemplate !== normalized && tweetTemplates.includes(normalized)) {
      addToast("同じテンプレートは登録済みです。", "error");
      return;
    }

    const nextTemplates = tweetTemplates.map((template) => (
      template === editingTweetTemplate ? normalized : template
    ));
    const nextActiveTemplate = activeTweetTemplate === editingTweetTemplate
      ? normalized
      : activeTweetTemplate;

    try {
      await invoke("save_setting_cmd", {
        setting: buildSettingPayload({
          tweetTemplates: nextTemplates,
          activeTweetTemplate: nextActiveTemplate,
        }),
      });
      setTweetTemplates(nextTemplates);
      setActiveTweetTemplate(nextActiveTemplate);
      setEditingTweetTemplate(null);
      setTweetTemplateDraft("");
      addToast("ツイートテンプレートを更新しました。");
    } catch (err) {
      addToast(`ツイートテンプレートの更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleSelectTweetTemplate = async (template: string) => {
    try {
      await invoke("save_setting_cmd", {
        setting: buildSettingPayload({
          activeTweetTemplate: template,
        }),
      });
      setActiveTweetTemplate(template);
      addToast("投稿テンプレートを切り替えました。");
    } catch (err) {
      addToast(`投稿テンプレートの切替に失敗しました: ${String(err)}`, "error");
    }
  };

  const handleDeleteTweetTemplate = async (template: string) => {
    if (tweetTemplates.length <= 1) {
      addToast("ツイートテンプレートは1件以上必要です。", "error");
      return;
    }

    const nextTemplates = tweetTemplates.filter((item) => item !== template);
    const nextActiveTemplate = activeTweetTemplate === template ? nextTemplates[0] : activeTweetTemplate;
    try {
      await invoke("save_setting_cmd", {
        setting: buildSettingPayload({
          tweetTemplates: nextTemplates,
          activeTweetTemplate: nextActiveTemplate,
        }),
      });
      setTweetTemplates(nextTemplates);
      setActiveTweetTemplate(nextActiveTemplate);
      if (editingTweetTemplate === template) {
        setEditingTweetTemplate(null);
        setTweetTemplateDraft("");
      }
      addToast("ツイートテンプレートを削除しました。");
    } catch (err) {
      addToast(`ツイートテンプレートの削除に失敗しました: ${String(err)}`, "error");
    }
  };

  const buildTweetText = (photo: Photo) => {
    const world = photo.world_name?.trim() || "ワールド不明";
    const date = photo.timestamp ? photo.timestamp.slice(0, 16).replace("T", " ") : "";
    const memo = photo.memo?.trim() || "";
    const tags = photo.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
    const source = activeTweetTemplate || DEFAULT_TWEET_TEMPLATE;

    return [
      ["{world}", world],
      ["{world-name}", world],
      ["{date}", date],
      ["{file}", photo.photo_filename],
      ["{memo}", memo],
      ["{tags}", tags],
    ].reduce((currentText, [token, value]) => replaceTemplateToken(currentText, token, value), source)
      .split("\n")
      .map((line: string) => line.trimEnd())
      .filter((line: string, index: number, lines: string[]) => line.length > 0 || (index > 0 && index < lines.length - 1))
      .join("\n")
      .trim();
  };

  const handleTweetPhoto = async (photo: Photo) => {
    const tweetText = buildTweetText(photo);
    if (!tweetText) {
      addToast("投稿テキストが空です。テンプレートを確認してください。", "error");
      return;
    }

    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    try {
      await Promise.all([
        invoke("open_tweet_intent_cmd", { intentUrl }),
        invoke("show_in_explorer", { path: photo.photo_path }),
      ]);
    } catch (err) {
      addToast(`投稿ページを開けませんでした: ${String(err)}`, "error");
    }
  };

  const worldNameList = useMemo(() => {
    const names = Array.from(new Set(photos.map((photo) => photo.world_name || ""))).sort();
    return names.some((name) => !!name.trim()) ? names : [];
  }, [photos]);
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
  const selectedPhotos = useMemo(
    () => selectedPhotoPaths
      .map((photoPath) => photos.find((photo) => photo.photo_path === photoPath))
      .filter((photo): photo is Photo => photo !== undefined),
    [selectedPhotoPaths, photos],
  );
  const selectedCount = selectedPhotos.length;
  const bulkFavoriteWillEnable = useMemo(
    () => selectedPhotos.some((photo) => !photo.is_favorite),
    [selectedPhotos],
  );
  const activeFilterCount = useMemo(() => (
    [
      worldFilters.length > 0,
      !!dateFrom || !!dateTo,
      orientationFilter !== "all",
      favoritesOnly,
      tagFilters.length > 0,
    ].filter(Boolean).length
  ), [worldFilters, dateFrom, dateTo, orientationFilter, favoritesOnly, tagFilters]);

  const handleBulkFavorite = async () => {
    if (selectedPhotos.length === 0) {
      return;
    }

    const nextFavoriteState = bulkFavoriteWillEnable;
    try {
      await invoke("bulk_set_photo_favorite_cmd", {
        photos: selectedPhotos.map((photo) => ({
          photoPath: photo.photo_path,
          sourceSlot: photo.source_slot ?? 1,
        })),
        isFavorite: nextFavoriteState,
      });
      setPhotos((prev) => prev.map((photo) => (
        selectedPhotoPathSet.has(photo.photo_path)
          ? { ...photo, is_favorite: nextFavoriteState }
          : photo
      )));
    } catch (err) {
      addToast(`一括お気に入り更新に失敗しました: ${String(err)}`, "error");
    }
  };

  const openBulkTagModal = () => {
    setBulkTagSelection("");
    setBulkTagDraft("");
    setIsBulkTagModalOpen(true);
  };

  const applyBulkTag = async () => {
    const resolvedTag = (bulkTagDraft.trim() || bulkTagSelection.trim());
    if (!resolvedTag) {
      addToast("一括タグ付けに使うタグを選択してください。", "error");
      return;
    }
    if (selectedPhotos.length === 0) {
      setIsBulkTagModalOpen(false);
      return;
    }

    try {
      await invoke("bulk_add_photo_tag_cmd", {
        photos: selectedPhotos.map((photo) => ({
          photoPath: photo.photo_path,
          sourceSlot: photo.source_slot ?? 1,
        })),
        tag: resolvedTag,
      });
      setPhotos((prev) => prev.map((photo) => (
        selectedPhotoPathSet.has(photo.photo_path) && !photo.tags.includes(resolvedTag)
          ? {
            ...photo,
            tags: [...photo.tags, resolvedTag].sort((left, right) => left.localeCompare(right, "ja")),
          }
          : photo
      )));
      setBulkTagDraft("");
      setBulkTagSelection("");
      setIsBulkTagModalOpen(false);
      addToast(`${selectedPhotos.length}件にタグを追加しました。`);
    } catch (err) {
      addToast(`一括タグ付けに失敗しました: ${String(err)}`, "error");
    }
  };

  const handleBulkCopy = async () => {
    if (selectedPhotos.length === 0) {
      return;
    }

    try {
      const destination = await open({
        directory: true,
        multiple: false,
        title: "コピー先フォルダを選択",
      });

      if (!destination || Array.isArray(destination)) {
        return;
      }

      await invoke("bulk_copy_photos_cmd", {
        photoPaths: selectedPhotos.map((photo) => photo.photo_path),
        destinationDir: destination,
      });
    } catch (err) {
      addToast(`一括コピーに失敗しました: ${String(err)}`, "error");
    }
  };

  const cellProps = useMemo(
    () => ({
      data: displayPhotoItems,
      onSelect: handlePhotoActivate,
      onToggleSelect: toggleSelectedPhoto,
      isSelected: (item: DisplayPhotoItem) => selectedPhotoPathSet.has(item.photo.photo_path),
      showTags: selectedCount > 0,
      columnCount,
    }),
    [displayPhotoItems, columnCount, selectedPhotoPathSet, selectedCount],
  );
  const displayTotalRows = Math.ceil(displayPhotoItems.length / columnCount);

  return (
    <div className={`alpheratz-root ${themeMode === "dark" ? "theme-dark" : "theme-light"}`}>
      <Header
        onRefresh={() => {
          if (scanStatus === "scanning") {
            cancelScan();
            return;
          }
          void startScan();
        }}
        onOpenSettings={() => setShowSettings(true)}
        onToggleFilters={() => setIsFilterOpen((prev) => !prev)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hashProgressLabel={isPhashRunning ? `ハッシュ計測中... ${similarPrepProgress.done}/${similarPrepProgress.total || 0}` : null}
        activeFilterCount={activeFilterCount}
      />

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
          <aside className="left-rail" aria-label="表示操作">
            <div className="left-rail-controls">
              <div className="left-rail-section">
                <div className="left-rail-section-title">編集</div>
                <div className="left-rail-nav-group" role="group" aria-label="編集">
                  <button
                    className="left-rail-button"
                    onClick={() => setShowSettings(true)}
                    aria-label="タグマスタ編集"
                    title="タグマスタ編集"
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Tag /></span>
                    <span className="left-rail-label">タグマスタ編集</span>
                  </button>
                  <button
                    className="left-rail-button"
                    onClick={() => setIsTweetTemplatePanelOpen(true)}
                    aria-label="テンプレート編集"
                    title="テンプレート編集"
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Template /></span>
                    <span className="left-rail-label">テンプレート編集</span>
                  </button>
                </div>
              </div>
              <div className="left-rail-section">
                <div className="left-rail-section-title">グループ化</div>
                <div className="left-rail-nav-group" role="group" aria-label="グループ化">
                  <button
                    className={`left-rail-button ${groupingMode === "none" ? "active" : ""}`}
                    onClick={() => setGroupingMode("none")}
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Stack /></span>
                    <span className="left-rail-label">なし</span>
                  </button>
                  <button
                    className={`left-rail-button ${groupingMode === "similar" ? "active" : ""}`}
                    onClick={() => setGroupingMode("similar")}
                    disabled={!isSimilarGroupingAvailable}
                    title={isSimilarGroupingAvailable ? "隣接画像の類似度でまとめる" : "似た写真の準備が終わるまで使えません"}
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Sparkles /></span>
                    <span className="left-rail-label">似た写真</span>
                  </button>
                  <button
                    className={`left-rail-button ${groupingMode === "world" ? "active" : ""}`}
                    onClick={() => setGroupingMode("world")}
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Globe /></span>
                    <span className="left-rail-label">ワールド</span>
                  </button>
                </div>
              </div>
              <div className="left-rail-section left-rail-section-viewmode">
                <div className="left-rail-section-title">表示形式</div>
                <div className="left-rail-nav-group" role="group" aria-label="表示形式">
                  <button
                    className={`left-rail-button ${viewMode === "standard" ? "active" : ""}`}
                    onClick={() => void handleViewModeChange("standard")}
                    aria-label="グリッド"
                    title="グリッド"
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Grid /></span>
                    <span className="left-rail-label">グリッド</span>
                  </button>
                  <button
                    className={`left-rail-button ${viewMode === "gallery" ? "active" : ""}`}
                    onClick={() => void handleViewModeChange("gallery")}
                    aria-label="ギャラリー"
                    title="ギャラリー"
                    type="button"
                  >
                    <span className="left-rail-icon"><Icons.Gallery /></span>
                    <span className="left-rail-label">ギャラリー</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <div className="right-panel" ref={rightPanelRef}>
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

            <div ref={gridWrapperRef} style={{ flex: 1, minHeight: 0, paddingBottom: selectedCount > 0 ? 92 : 0 }}>
              <PhotoGrid
                photos={displayPhotoItems}
                viewMode={viewMode}
                scrollTop={scrollTop}
                columnCount={columnCount}
                columnWidth={standardColumnWidth}
                totalRows={displayTotalRows}
                ROW_HEIGHT={ROW_HEIGHT}
                gridHeight={gridHeight}
                panelWidth={panelWidth}
                handleGridScroll={handleGridScroll}
                handleGridWheel={handleGridWheel}
                totalHeight={totalHeight}
                galleryLayout={galleryLayout}
                cellProps={{ ...cellProps, data: displayPhotoItems }}
                onGridRef={onGridRef}
              />
            </div>
            {selectedCount > 0 && (
              <div className="bulk-selection-bar" role="region" aria-label="複数選択アクション">
                <div className="bulk-selection-count">{selectedCount}件選択中</div>
                <div className="bulk-selection-actions">
                  <button
                    className={`bulk-selection-button ${bulkFavoriteWillEnable ? "primary" : ""}`}
                    onClick={() => void handleBulkFavorite()}
                    type="button"
                  >
                    {bulkFavoriteWillEnable ? "一括お気に入り" : "一括お気に入り解除"}
                  </button>
                  <button
                    className="bulk-selection-button"
                    onClick={openBulkTagModal}
                    type="button"
                  >
                    一括タグ付け
                  </button>
                  <button
                    className="bulk-selection-button"
                    onClick={() => void handleBulkCopy()}
                    type="button"
                  >
                    一括別フォルダコピー
                  </button>
                </div>
                <button
                  className="bulk-selection-dismiss"
                  onClick={clearSelectedPhotos}
                  aria-label="選択を解除"
                  type="button"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {groupingMode === "none" && (
            <MonthNav
              monthsByYear={monthsByYear}
              monthGroups={monthGroups}
              activeMonthIndex={activeMonthIndex}
              scrollTop={scrollTop}
              maxScrollTop={maxScrollTop}
              handleJumpToRatio={handleJumpToRatio}
            />
          )}
        </div>
      </main>

      {isBulkTagModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBulkTagModalOpen(false)}>
          <div className="modal-content quick-tag-modal" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setIsBulkTagModalOpen(false)}
              aria-label="閉じる"
            >
              ×
            </button>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="modal-info">
                <div className="info-header">
                  <h2>一括タグ付け</h2>
                </div>
                <div className="quick-tag-modal-body">
                  <p>{selectedCount}件の写真へ追加するタグを選択してください。</p>
                  <label className="quick-tag-modal-label" htmlFor="bulk-tag-select">既存タグ</label>
                  <div className="tag-select-wrap">
                    <select
                      id="bulk-tag-select"
                      className="tag-select"
                      value={bulkTagSelection}
                      disabled={!hasMasterTags}
                      onChange={(event) => setBulkTagSelection(event.target.value)}
                    >
                      <option value="">{hasMasterTags ? "タグを選択..." : "タグが登録されていません"}</option>
                      {tagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="quick-tag-modal-label" htmlFor="bulk-tag-draft">新規タグ</label>
                  <input
                    id="bulk-tag-draft"
                    className="quick-tag-input"
                    value={bulkTagDraft}
                    onChange={(event) => setBulkTagDraft(event.target.value)}
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
                    className="modal-secondary-button"
                    onClick={() => setIsBulkTagModalOpen(false)}
                    type="button"
                  >
                    キャンセル
                  </button>
                  <button
                    className="world-link-button"
                    onClick={() => void applyBulkTag()}
                  >
                    追加
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
          onTweet={() => void handleTweetPhoto(selectedPhotoView)}
          onAddTag={(tag) => addTag(selectedPhotoView.photo_path, tag)}
          onRemoveTag={(tag) => removeTag(selectedPhotoView.photo_path, tag)}
          addToast={addToast}
        />
      )}

      {isTweetTemplatePanelOpen && (
        <div className="modal-overlay" onClick={() => setIsTweetTemplatePanelOpen(false)}>
          <div className="modal-content settings-panel tweet-template-panel" onClick={(event) => event.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => {
                setIsTweetTemplatePanelOpen(false);
                handleCancelTweetTemplateEdit();
              }}
              aria-label="閉じる"
              type="button"
            >
              ×
            </button>
            <div className="modal-body tweet-template-modal-body">
              <div className="modal-info">
                <div className="info-header"><h2>投稿テンプレート</h2></div>
                <div className="memo-section">
                  <label>{editingTweetTemplate ? "テンプレート編集" : "新規テンプレート"}</label>
                  <textarea
                    className="tweet-template-textarea"
                    value={tweetTemplateDraft}
                    onChange={(event) => setTweetTemplateDraft(event.target.value)}
                    placeholder={`例:\nWorld: {world-name}\nAuthor:\n\n#VRChat_world紹介`}
                  />
                  <div className="tweet-template-help">
                    使える置換: {"{world-name}"}
                  </div>
                  <div className="tweet-template-editor-actions">
                    {editingTweetTemplate && (
                      <button
                        className="modal-secondary-button"
                        onClick={handleCancelTweetTemplateEdit}
                        type="button"
                      >
                        キャンセル
                      </button>
                    )}
                    <button
                      className="save-button"
                      onClick={() => void handleSaveTweetTemplate()}
                      type="button"
                    >
                      {editingTweetTemplate ? "更新" : "登録"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-info tweet-template-list-panel">
                <div className="info-header"><h2>テンプレート一覧</h2></div>
                <div className="memo-section">
                  <label>登録済みテンプレート</label>
                  <div className="tweet-template-list">
                    {tweetTemplates.map((template) => (
                      <div
                        key={template}
                        className={`tweet-template-item ${template === activeTweetTemplate ? "active" : ""}`}
                      >
                        <button
                          className="tweet-template-select"
                          onClick={() => void handleSelectTweetTemplate(template)}
                          type="button"
                        >
                          <span className="tweet-template-item-title">
                            {template === activeTweetTemplate ? "使用中" : "テンプレート"}
                          </span>
                          <span className="tweet-template-item-body">{template}</span>
                        </button>
                        <div className="tweet-template-item-actions">
                          <button
                            className="modal-secondary-button tweet-template-action-button"
                            onClick={() => handleStartTweetTemplateEdit(template)}
                            type="button"
                          >
                            編集
                          </button>
                          <button
                            className="tag-master-remove"
                            onClick={() => void handleDeleteTweetTemplate(template)}
                            type="button"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
                    className="modal-secondary-button"
                    onClick={() => setPendingFolderPath(null)}
                    disabled={isApplyingFolderChange}
                    type="button"
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
                    className="modal-secondary-button"
                    onClick={() => void finalizeFolderSelection(pendingRestoreCandidate.photo_folder_path, false)}
                    disabled={isApplyingFolderChange}
                    type="button"
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
