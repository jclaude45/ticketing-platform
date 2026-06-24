'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface OccupancyChartProps {
  scanned: number;
  total: number;
  capacity?: number;
  isLoading?: boolean;
}

const COLORS = ['#6366f1', '#a855f7', '#e5e7eb'];

export function OccupancyChart({ scanned, total, capacity, isLoading }: OccupancyChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm animate-pulse">
        <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 mb-1" />
        <div className="h-[200px] rounded-lg bg-gray-100 dark:bg-gray-800 mt-4" />
      </div>
    );
  }
  const cap = capacity ?? total;
  const remaining = Math.max(0, total - scanned);
  const notGenerated = Math.max(0, cap - total);

  const data = [
    { name: 'Scanned', value: scanned },
    { name: 'Issued (not scanned)', value: remaining },
    { name: 'Available', value: notGenerated },
  ].filter((d) => d.value > 0);

  const occupancyPct = cap > 0 ? Math.round((scanned / cap) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm">Occupancy</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Ticket status breakdown</p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e1b4b',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '-10px' }}>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{occupancyPct}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">occupied</p>
          </div>
        </div>
      </div>
    </div>
  );
}
