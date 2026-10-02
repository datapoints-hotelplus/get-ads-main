"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

/**
 * Generic sortable data table — @tanstack/react-table is already a project
 * dependency (see app/dashboard/page.tsx's HeatmapTable for the original
 * pattern this follows); this just makes it reusable instead of
 * hand-rolling a plain <table> with no sorting per page.
 */
export default function SortableTable<T>({
  columns,
  data,
  defaultSort,
  pageSize = 20,
  emptyMessage = "ไม่มีข้อมูล",
  // Opt-in — only the Ad Detail table asked for this; every other table
  // using this component keeps the old plain-scroll behavior unchanged.
  // Both need the *same* bounded, internally-scrolling container: position:
  // sticky only sticks against ITS nearest scrolling ancestor, and per the
  // CSS overflow spec, the plain overflow-x-auto wrapper below silently
  // upgrades its own overflow-y from visible to auto too (same gotcha as
  // the Timing Heatmap tooltip) — so a sticky thead inside a height-
  // unconstrained div never finds anything to actually stick against while
  // the page itself scrolls. Giving the container a real max-height and
  // scrolling both axes inside it fixes that at the root instead of fighting it.
  stickyHeader = false,
  stickyFirstColumn = false,
  maxHeight = "70vh",
}: {
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[];
  defaultSort?: SortingState;
  pageSize?: number;
  emptyMessage?: string;
  stickyHeader?: boolean;
  stickyFirstColumn?: boolean;
  maxHeight?: string;
}) {
  "use no memo";
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (data.length === 0) {
    return <p className="text-sm text-black text-center py-8">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="overflow-auto" style={stickyHeader ? { maxHeight } : undefined}>
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className={`bg-gray-50 text-left text-xs font-semibold text-black uppercase tracking-wide ${stickyHeader ? "sticky top-0 z-10" : ""}`}
              >
                {hg.headers.map((header, colIdx) => {
                  const align = (header.column.columnDef.meta as { align?: "left" | "right" | "center" } | undefined)?.align ?? "left";
                  // The corner cell (sticky row × sticky column) needs to
                  // win both stacking contexts, hence z-20 — everything
                  // else sticky in this table sits at z-10.
                  const pinned = stickyFirstColumn && colIdx === 0;
                  return (
                    <th
                      key={header.id}
                      className={`px-4 py-3 select-none whitespace-nowrap bg-gray-50 ${
                        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
                      } ${header.column.getCanSort() ? "cursor-pointer hover:text-secondary" : ""} ${
                        pinned ? "sticky left-0 z-20" : ""
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && "▲"}
                        {header.column.getIsSorted() === "desc" && "▼"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="group hover:bg-gray-50 transition-colors">
                {row.getVisibleCells().map((cell, colIdx) => {
                  const align = (cell.column.columnDef.meta as { align?: "left" | "right" | "center" } | undefined)?.align ?? "left";
                  const pinned = stickyFirstColumn && colIdx === 0;
                  return (
                    <td
                      key={cell.id}
                      className={`px-4 py-3 text-black ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${
                        // bg-white (not transparent) so pinned content from
                        // scrolled-past columns doesn't show through
                        // underneath — group-hover keeps it in sync with the
                        // row's own hover tint instead of looking stuck.
                        pinned ? "sticky left-0 z-1 bg-white group-hover:bg-gray-50" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="disabled:opacity-30 hover:text-secondary"
          >
            ← Prev
          </button>
          <span>
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="disabled:opacity-30 hover:text-secondary"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
