"use client";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import type { ResolvedStep } from "@/lib/types";
import { useLang } from "./prefs";
import { StepCard } from "./step-card";

function SortableStep({
  step,
  index,
  os,
  actions,
  dragLabel,
}: {
  step: ResolvedStep;
  index: number;
  os: "posix" | "windows";
  actions: ReactNode;
  dragLabel: string;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  return (
    <StepCard
      ref={setNodeRef}
      step={step}
      index={index}
      os={os}
      dragging={isDragging}
      className={isDragging ? "relative z-10 scroll-mt-36" : "scroll-mt-36"}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      actions={actions}
      handle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          // Before dnd-kit lifts the card by keyboard, bring the whole card into view. Otherwise
          // its activation scroll leaves stale rects and the first ↑/↓ can skip a slot.
          onKeyDownCapture={(e) => {
            if (!isDragging && (e.key === " " || e.key === "Enter")) e.currentTarget.closest("li")?.scrollIntoView({ block: "nearest" });
          }}
          aria-label={dragLabel}
          className="focus-ring motion-fast -ml-1 grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded text-subtle hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
        >
          <svg viewBox="0 0 12 20" className="h-4 w-3" aria-hidden>
            {[4, 10, 16].map((y) => (
              <g key={y} fill="currentColor">
                <circle cx="3" cy={y} r="1.5" />
                <circle cx="9" cy={y} r="1.5" />
              </g>
            ))}
          </svg>
        </button>
      }
    />
  );
}

/**
 * Reorderable step list. Pointer drag, or keyboard: focus a handle, Space to lift, ↑/↓ to move,
 * Space to drop, Esc to cancel. Moves are announced through dnd-kit's live region.
 */
export function SortableSteps({
  steps,
  os,
  onReorder,
  renderActions,
}: {
  steps: ResolvedStep[];
  os: "posix" | "windows";
  onReorder: (ids: string[]) => void;
  renderActions: (step: ResolvedStep, index: number) => ReactNode;
}) {
  const { lang, t } = useLang();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: "auto" })
  );
  const ids = steps.map((s) => s.id);
  const title = (id: string | number) => steps.find((s) => s.id === id)?.title[lang] ?? String(id);
  const pos = (id: string | number | undefined) => (id === undefined ? 0 : ids.indexOf(String(id)) + 1);

  const announcements: Announcements =
    lang === "th"
      ? {
          onDragStart: ({ active }) => `ยก “${title(active.id)}” แล้ว อยู่ลำดับที่ ${pos(active.id)} จาก ${ids.length}`,
          onDragOver: ({ active, over }) => (over ? `“${title(active.id)}” ย้ายไปลำดับที่ ${pos(over.id)}` : ""),
          onDragEnd: ({ active, over }) => (over ? `วาง “${title(active.id)}” ที่ลำดับ ${pos(over.id)}` : "ยกเลิก"),
          onDragCancel: ({ active }) => `ยกเลิกการย้าย “${title(active.id)}”`,
        }
      : {
          onDragStart: ({ active }) => `Picked up “${title(active.id)}”, position ${pos(active.id)} of ${ids.length}.`,
          onDragOver: ({ active, over }) => (over ? `“${title(active.id)}” moved to position ${pos(over.id)}.` : ""),
          onDragEnd: ({ active, over }) => (over ? `Dropped “${title(active.id)}” at position ${pos(over.id)}.` : "Cancelled."),
          onDragCancel: ({ active }) => `Cancelled moving “${title(active.id)}”.`,
        };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  }

  // closestCorners: step cards have very different heights, so compare corners, not centres.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t("review.dragHint") } }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="space-y-4" aria-label={t("builder.steps")}>
          {steps.map((step, i) => (
            <SortableStep
              key={step.id}
              step={step}
              index={i}
              os={os}
              actions={renderActions(step, i)}
              dragLabel={`${t("review.drag")}: ${step.title[lang]}`}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
