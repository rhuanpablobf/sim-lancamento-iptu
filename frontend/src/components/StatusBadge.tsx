import React from "react";

type BadgeType = "up" | "down" | "normal" | "social" | "minimum" | "processing" | "done" | "waiting";

export function StatusBadge({ type, children }: { type: BadgeType; children: React.ReactNode }) {
  const styles = {
    up: "bg-danger-light text-danger",
    down: "bg-success-light text-success",
    normal: "bg-surface-tertiary text-text-secondary",
    social: "bg-primary-light text-primary",
    minimum: "bg-warning-light text-warning",
    processing: "bg-warning-light text-warning",
    done: "bg-success-light text-success",
    waiting: "bg-surface-tertiary text-text-secondary"
  };

  return (
    <span className={`px-2 py-0.5 rounded-[20px] text-[11px] font-medium whitespace-nowrap ${styles[type]}`}>
      {children}
    </span>
  );
}
