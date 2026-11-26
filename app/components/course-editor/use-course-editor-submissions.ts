import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import type { DropResult } from "@hello-pangea/dnd";
import type { EditorCourse } from "./types";

/**
 * The page-level submissions of the course editor: status, price, PPP, sales
 * copy and drag-and-drop reordering, each with its toast. They live in the
 * page rather than in the tab that triggers them because inactive tabs
 * unmount, and a submission (or the sales copy draft) must outlive a tab
 * switch.
 */
export function useCourseEditorSubmissions(course: EditorCourse) {
  const statusFetcher = useFetcher();
  const reorderFetcher = useFetcher();
  const lessonReorderFetcher = useFetcher();
  const salesCopyFetcher = useFetcher();
  const priceFetcher = useFetcher();
  const pppFetcher = useFetcher();

  const [salesCopy, setSalesCopy] = useState<string>(course.salesCopy);
  const salesCopyHasChanges = salesCopy !== course.salesCopy;
  const salesCopyIsEmpty = salesCopy.trim().length === 0;

  useEffect(() => {
    if (statusFetcher.state === "idle" && statusFetcher.data?.success) {
      toast.success("Course status updated.");
    }
    if (statusFetcher.state === "idle" && statusFetcher.data?.error) {
      toast.error(statusFetcher.data.error);
    }
  }, [statusFetcher.state, statusFetcher.data]);

  useEffect(() => {
    if (reorderFetcher.state === "idle" && reorderFetcher.data?.success) {
      toast.success("Modules reordered.");
    }
    if (reorderFetcher.state === "idle" && reorderFetcher.data?.error) {
      toast.error(reorderFetcher.data.error);
    }
  }, [reorderFetcher.state, reorderFetcher.data]);

  useEffect(() => {
    if (
      lessonReorderFetcher.state === "idle" &&
      lessonReorderFetcher.data?.success
    ) {
      toast.success("Lessons reordered.");
    }
    if (
      lessonReorderFetcher.state === "idle" &&
      lessonReorderFetcher.data?.error
    ) {
      toast.error(lessonReorderFetcher.data.error);
    }
  }, [lessonReorderFetcher.state, lessonReorderFetcher.data]);

  useEffect(() => {
    if (salesCopyFetcher.state === "idle" && salesCopyFetcher.data?.success) {
      toast.success("Sales copy saved.");
    }
    if (salesCopyFetcher.state === "idle" && salesCopyFetcher.data?.error) {
      toast.error(salesCopyFetcher.data.error);
    }
  }, [salesCopyFetcher.state, salesCopyFetcher.data]);

  useEffect(() => {
    if (priceFetcher.state === "idle" && priceFetcher.data?.success) {
      toast.success("Price updated.");
    }
    if (priceFetcher.state === "idle" && priceFetcher.data?.error) {
      toast.error(priceFetcher.data.error);
    }
  }, [priceFetcher.state, priceFetcher.data]);

  useEffect(() => {
    if (pppFetcher.state === "idle" && pppFetcher.data?.success) {
      toast.success("PPP setting updated.");
    }
    if (pppFetcher.state === "idle" && pppFetcher.data?.error) {
      toast.error(pppFetcher.data.error);
    }
  }, [pppFetcher.state, pppFetcher.data]);

  function handleSalesCopySave() {
    salesCopyFetcher.submit(
      { intent: "update-sales-copy", salesCopy },
      { method: "post" }
    );
  }

  function handleStatusChange(newStatus: string) {
    statusFetcher.submit(
      { intent: "update-status", status: newStatus },
      { method: "post" }
    );
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (
      result.source.droppableId === result.destination.droppableId &&
      result.source.index === result.destination.index
    ) {
      return;
    }

    if (result.type === "module") {
      const reordered = Array.from(course.modules);
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, moved);

      const moduleIds = reordered.map((m) => m.id);
      reorderFetcher.submit(
        { intent: "reorder-modules", moduleIds: JSON.stringify(moduleIds) },
        { method: "post" }
      );
    } else if (result.type === "lesson") {
      const sourceModuleId = parseInt(
        result.source.droppableId.replace("lessons-", ""),
        10
      );
      const destModuleId = parseInt(
        result.destination.droppableId.replace("lessons-", ""),
        10
      );

      if (sourceModuleId === destModuleId) {
        // Reorder within the same module
        const mod = course.modules.find((m) => m.id === sourceModuleId);
        if (!mod) return;

        const reordered = Array.from(mod.lessons);
        const [moved] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, moved);

        const lessonIds = reordered.map((l) => l.id);
        lessonReorderFetcher.submit(
          {
            intent: "reorder-lessons",
            moduleId: String(sourceModuleId),
            lessonIds: JSON.stringify(lessonIds),
          },
          { method: "post" }
        );
      } else {
        // Move lesson to a different module
        const sourceMod = course.modules.find((m) => m.id === sourceModuleId);
        if (!sourceMod) return;

        const lesson = sourceMod.lessons[result.source.index];
        if (!lesson) return;

        // Target position is 1-based (destination index + 1)
        const targetPosition = result.destination.index + 1;

        lessonReorderFetcher.submit(
          {
            intent: "move-lesson",
            lessonId: String(lesson.id),
            targetModuleId: String(destModuleId),
            targetPosition: String(targetPosition),
          },
          { method: "post" }
        );
      }
    }
  }

  function handlePriceChange(price: string) {
    priceFetcher.submit({ intent: "update-price", price }, { method: "post" });
  }

  function handlePppToggle() {
    pppFetcher.submit(
      {
        intent: "update-ppp-enabled",
        pppEnabled: String(!course.pppEnabled),
      },
      { method: "post" }
    );
  }

  return {
    salesCopy,
    setSalesCopy,
    salesCopyHasChanges,
    salesCopyIsEmpty,
    salesCopyIsSaving: salesCopyFetcher.state !== "idle",
    handleSalesCopySave,
    handleStatusChange,
    handlePriceChange,
    handlePppToggle,
    handleDragEnd,
  };
}
