import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

export function useArchiveSelection(archiveFiles: string[]) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const isDraggingSelect = useRef(false);
  const dragMode = useRef<"select" | "deselect">("select");

  useEffect(() => {
    const handleMouseUp = () => {
      isDraggingSelect.current = false;
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setLastSelected(null);
    isDraggingSelect.current = false;
  }, []);

  const handleFileAction = useCallback(
    (event: MouseEvent, file: string, type: "down" | "enter") => {
      if (type === "down") {
        if (event.shiftKey && lastSelected) {
          const startIdx = archiveFiles.indexOf(lastSelected);
          const endIdx = archiveFiles.indexOf(file);
          if (startIdx !== -1 && endIdx !== -1) {
            const min = Math.min(startIdx, endIdx);
            const max = Math.max(startIdx, endIdx);
            const range = archiveFiles.slice(min, max + 1);
            setSelectedFiles((prev) => {
              const next = new Set(prev);
              range.forEach((name) => next.add(name));
              return next;
            });
          }
          return;
        }

        isDraggingSelect.current = true;
        if (event.ctrlKey || event.metaKey) {
          dragMode.current = selectedFiles.has(file) ? "deselect" : "select";
        } else if (!selectedFiles.has(file)) {
          setSelectedFiles(new Set([file]));
          dragMode.current = "select";
        } else {
          dragMode.current = "select";
        }

        setSelectedFiles((prev) => {
          const next = new Set<string>(
            event.ctrlKey || event.metaKey
              ? prev
              : dragMode.current === "select"
                ? prev
                : new Set<string>(),
          );
          if (dragMode.current === "select") {
            next.add(file);
          } else {
            next.delete(file);
          }
          return next;
        });
        setLastSelected(file);
        return;
      }

      if (isDraggingSelect.current) {
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          if (dragMode.current === "select") {
            next.add(file);
          } else {
            next.delete(file);
          }
          return next;
        });
        setLastSelected(file);
      }
    },
    [archiveFiles, lastSelected, selectedFiles],
  );

  const handleSelectAll = useCallback(() => {
    if (selectedFiles.size === archiveFiles.length) {
      clearSelection();
      return;
    }
    setSelectedFiles(new Set(archiveFiles));
  }, [archiveFiles, clearSelection, selectedFiles.size]);

  return {
    selectedFiles,
    setSelectedFiles,
    clearSelection,
    handleFileAction,
    handleSelectAll,
  };
}
