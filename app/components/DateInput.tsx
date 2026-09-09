"use client";

import { useRef, useState } from "react";
import { isoToDisplay, displayToIso } from "./dateFormat";

/**
 * Date field that reads and writes dd/mm/yyyy.
 *
 * Drop-in for `<input type="date">`: `value`/`onChange` still speak ISO
 * ("2026-09-08"), so no caller has to change how it stores or sends dates —
 * only what the user sees changes.
 *
 * Why not just `<input type="date" lang="...">`: a native date input renders
 * in the *browser's* locale and gives the page no say in it, so the same build
 * shows dd/mm/yyyy to one person and mm/dd/yyyy to another. The only way to
 * pin the format is to own the text, which means a text input.
 *
 * The native picker is kept rather than replaced with a custom calendar — it
 * is one hidden `<input type="date">` opened via showPicker(), so keyboard
 * entry, mobile date wheels, and min/max clamping all keep working for free
 * instead of being reimplemented (and a calendar library stays uninstalled).
 */
export default function DateInput({
  value,
  onChange,
  className = "",
  min,
  max,
  "aria-label": ariaLabel,
}: {
  /** ISO yyyy-mm-dd, same as a native date input. */
  value: string;
  /** Called with ISO yyyy-mm-dd once the typed text is a real date. */
  onChange: (iso: string) => void;
  className?: string;
  min?: string;
  max?: string;
  "aria-label"?: string;
}) {
  // While typing, the box has to show exactly what was typed — including the
  // intermediate "08/09/20" that isn't a date yet. `draft` holds that text;
  // null means "not typing, show the committed value".
  const [draft, setDraft] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const commit = (text: string) => {
    setDraft(text);
    const iso = displayToIso(text);
    if (iso) onChange(iso);
  };

  return (
    <span className="relative inline-flex items-center">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        aria-label={ariaLabel}
        value={draft ?? isoToDisplay(value)}
        onChange={(e) => commit(e.target.value)}
        // Drop the draft on blur so a half-typed or impossible entry snaps back
        // to the value actually in effect, rather than sitting there looking
        // applied when it never was.
        onBlur={() => setDraft(null)}
        className={className}
      />
      <button
        type="button"
        // Opening the picker is a convenience on top of a fully usable text
        // field, so a browser without showPicker() simply does nothing here.
        onClick={() => {
          try {
            picker.current?.showPicker?.();
          } catch {
            // Firefox throws when showPicker() isn't from a trusted gesture.
          }
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute right-1 px-1 text-xs text-gray-400 hover:text-black cursor-pointer"
        title="เลือกจากปฏิทิน"
      >
        📅
      </button>
      <input
        ref={picker}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          setDraft(null);
          onChange(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        // Not `hidden`/`display:none` — showPicker() refuses to open on an
        // element that isn't rendered. Zero-sized and transparent instead.
        className="absolute right-1 w-0 h-0 opacity-0 pointer-events-none"
      />
    </span>
  );
}
