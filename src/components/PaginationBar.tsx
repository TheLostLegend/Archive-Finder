import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Grid,
} from 'lucide-react';
import { formatNumber } from '../utils/formatters';

interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  colsPerRow: number;
  rowsCount: number; // Always 20 rows as requested
  isLoading: boolean;
  onPageChange: (page: number) => void;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  colsPerRow,
  rowsCount,
  isLoading,
  onPageChange,
}) => {
  const itemsPerPage = rowsCount * colsPerRow;
  // Archive.org advancedsearch supports deep paging up to ~10000 start offset reliably
  const maxAccessibleItems = Math.min(totalItems, 10000);
  const totalPages = Math.max(1, Math.ceil(maxAccessibleItems / itemsPerPage));
  const actualTotalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const [jumpInput, setJumpInput] = useState(String(currentPage));

  useEffect(() => {
    setJumpInput(String(currentPage));
  }, [currentPage]);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(jumpInput, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(1, Math.min(totalPages, parsed));
      onPageChange(clamped);
    }
  };

  // Build visible page window
  const getPageNumbers = (): number[] => {
    const windowSize = 5;
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + windowSize - 1);
    if (end - start + 1 < windowSize) {
      start = Math.max(1, end - windowSize + 1);
    }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-3 bg-[#111620] border border-[#222C3E] rounded-xl text-xs">
      {/* Left: 20-Row Responsive Formula Status */}
      <div className="flex flex-wrap items-center gap-2 text-slate-300">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 font-mono text-sky-300">
          <Grid className="w-3.5 h-3.5 text-sky-400" />
          {rowsCount} строк × {colsPerRow} {colsPerRow === 1 ? 'папка' : colsPerRow < 5 ? 'папки' : 'папок'} ={' '}
          <strong className="text-white">{itemsPerPage}</strong> / стр.
        </span>
        <span className="text-slate-400">
          Всего найдено:{' '}
          <strong className="text-slate-100 font-mono">{formatNumber(totalItems)}</strong> папок
          {actualTotalPages > totalPages && (
            <span className="text-slate-500 ml-1">
              (доступно {formatNumber(totalPages)} стр. индекса)
            </span>
          )}
        </span>
      </div>

      {/* Right: Page Buttons + Jump Input */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onClick={() => onPageChange(1)}
          title="Первая страница"
          className="p-1.5 rounded-md bg-[#171F2E] hover:bg-[#222E44] disabled:opacity-35 disabled:pointer-events-none border border-[#273349] text-slate-200"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onClick={() => onPageChange(currentPage - 1)}
          title="Предыдущая страница"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#171F2E] hover:bg-[#222E44] disabled:opacity-35 disabled:pointer-events-none border border-[#273349] text-slate-200 font-medium"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Назад
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((p) => (
            <button
              key={p}
              type="button"
              disabled={isLoading}
              onClick={() => onPageChange(p)}
              className={`min-w-[2rem] px-2 py-1.5 rounded-md font-mono font-medium transition-colors border ${
                p === currentPage
                  ? 'bg-sky-500 text-[#05101A] border-sky-400 font-bold'
                  : 'bg-[#171F2E] hover:bg-[#222E44] text-slate-300 border-[#273349]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages || isLoading}
          onClick={() => onPageChange(currentPage + 1)}
          title="Следующая страница"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#171F2E] hover:bg-[#222E44] disabled:opacity-35 disabled:pointer-events-none border border-[#273349] text-slate-200 font-medium"
        >
          Вперёд
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          disabled={currentPage >= totalPages || isLoading}
          onClick={() => onPageChange(totalPages)}
          title="Последняя страница"
          className="p-1.5 rounded-md bg-[#171F2E] hover:bg-[#222E44] disabled:opacity-35 disabled:pointer-events-none border border-[#273349] text-slate-200"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>

        <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 ml-1">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            aria-label="Номер страницы"
            className="w-14 px-2 py-1.5 rounded-md bg-[#0B0E14] border border-[#2A364F] text-center font-mono text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <span className="text-slate-400 font-mono">/ {totalPages}</span>
        </form>
      </div>
    </div>
  );
};
