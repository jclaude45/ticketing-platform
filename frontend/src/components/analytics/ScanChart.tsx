'use client';

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';

interface ScanChartProps {
  data: { hour: string; count: number }[];
  title?: string;
  label?: string;
  color?: string;
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label, dataLabel }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  dataLabel?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900 dark:bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-gray-400 text-xs">{label}</p>
        <p className="text-white font-semibold text-sm">{payload[0].value} {dataLabel ?? 'scans'}</p>
      </div>
    );
  }
  return null;
};

export function ScanChart({ data, title, label, color = '#6366f1', isLoading }: ScanChartProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-[200px] rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  const gradientId = `scanArea-${color.replace('#', '')}`;

  const wrapper = (content: React.ReactNode) =>
    title ? (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Hourly scan activity</p>
        {content}
      </div>
    ) : <>{content}</>;

  return wrapper(
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -30, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip dataLabel={label} />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 5, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
