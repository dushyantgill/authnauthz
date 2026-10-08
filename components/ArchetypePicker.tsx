"use client";
import { useEffect, useRef, useState } from "react";
import { archetypes, type ArchetypeId } from "../lib/archetypes";
const options = Object.entries(archetypes) as [
  ArchetypeId,
  (typeof archetypes)[ArchetypeId],
][];
export function ArchetypePicker({
  value,
  disabled,
  onChange,
  compact = false,
}: {
  value: ArchetypeId;
  disabled: boolean;
  onChange: (id: ArchetypeId) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [focus, setFocus] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    items = useRef<(HTMLButtonElement | null)[]>([]);
  const current = archetypes[value];
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open) items.current[focus]?.focus();
  }, [open, focus]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  function show() {
    setFocus(options.findIndex(([id]) => id === value));
    setOpen(true);
  }
  return (
    <div
      ref={root}
      className={"archetype-picker" + (compact ? " compact" : "")}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="archetype-trigger"
        disabled={disabled}
        aria-label={"Choose archetype: " + current.name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="archetype-symbol">
          {value === "realestate" ? "▥" : value === "biotech" ? "⚗" : "◇"}
        </span>
        <span className="archetype-label">
          <small>ARCHETYPE</small>
          <strong>{current.name}</strong>
        </span>
        <span
          aria-hidden="true"
          className={open ? "picker-chevron open" : "picker-chevron"}
        >
          ⌄
        </span>
      </button>
      {open && (
        <div
          className="archetype-menu"
          role="menu"
          aria-label="Enterprise archetype"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              trigger.current?.focus();
            } else if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
            ) {
              e.preventDefault();
              setFocus(
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? options.length - 1
                    : (focus +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length,
              );
            }
          }}
        >
          <div className="picker-caption">Choose your enterprise</div>
          {options.map(([id, a], i) => (
            <button
              key={id}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="menuitemradio"
              aria-checked={value === id}
              tabIndex={focus === i ? 0 : -1}
              className={
                value === id ? "picker-option selected" : "picker-option"
              }
              onFocus={() => setFocus(i)}
              onClick={() => {
                setOpen(false);
                onChange(id);
                trigger.current?.focus();
              }}
            >
              <span className="option-symbol">
                {id === "realestate" ? "▥" : id === "biotech" ? "⚗" : "◇"}
              </span>
              <span>
                <strong>{a.name}</strong>
                <small>
                  {id === "realestate"
                    ? "Investments, development & property"
                    : id === "biotech"
                      ? "Research, clinical & technical operations"
                      : "Underwriting, actuarial & claims"}
                </small>
              </span>
              <span className="picker-check" aria-hidden="true">
                {id === value ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
