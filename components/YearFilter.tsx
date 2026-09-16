import React from 'react';

export const DATA_YEARS = [2026, 2025, 2024, 2023] as const;

export const DEFAULT_DATA_YEAR = DATA_YEARS.includes(
  new Date().getFullYear() as (typeof DATA_YEARS)[number],
)
  ? new Date().getFullYear()
  : DATA_YEARS[0];

type YearFilterProps = {
  value: number | '';
  onChange: (year: number | '') => void;
  includeAll?: boolean;
  className?: string;
};

const YearFilter: React.FC<YearFilterProps> = ({
  value,
  onChange,
  includeAll = false,
  className = '',
}) => (
  <label className={`inline-flex items-center gap-2 ${className}`}>
    <span className="text-xs font-black text-slate-500 whitespace-nowrap">שנת נתונים</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : '')}
      className="text-sm font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-purple-100"
      aria-label="סינון לפי שנה"
    >
      {includeAll && <option value="">כל השנים</option>}
      {DATA_YEARS.map((year) => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  </label>
);

export default YearFilter;
