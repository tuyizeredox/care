'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '@/lib/constants';

const AXIS = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
};

export interface SeriesPoint {
  label: string;
  [key: string]: string | number;
}

/** Grouped bars - department and project comparisons. */
export function ComparisonBarChart({
  data,
  series,
  height = 260,
}: {
  data: SeriesPoint[];
  series: Array<{ key: string; name: string; color?: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...AXIS} interval={0} angle={-12} textAnchor="end" height={48} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        {series.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            radius={[3, 3, 0, 0]}
            maxBarSize={34}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Created vs completed over time. */
export function TrendLineChart({
  data,
  series,
  height = 260,
}: {
  data: SeriesPoint[];
  series: Array<{ key: string; name: string; color?: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        {series.map((entry, index) => (
          <Line
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.name}
            stroke={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Status or waiting-reason breakdown. */
export function BreakdownPieChart({
  data,
  height = 240,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
}) {
  const filtered = data.filter((entry) => entry.value > 0);
  if (filtered.length === 0) {
    return (
      <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No data to chart yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="label"
          innerRadius={52}
          outerRadius={82}
          paddingAngle={2}
          strokeWidth={0}
        >
          {filtered.map((entry, index) => (
            <Cell key={entry.label} fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars - bottleneck hold times, where labels are long. */
export function HorizontalBarChart({
  data,
  valueKey = 'value',
  height = 300,
  unit,
}: {
  data: Array<Record<string, string | number>>;
  valueKey?: string;
  height?: number;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" width={150} {...AXIS} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
          formatter={(value: number) => [value + (unit ? ' ' + unit : ''), 'Average']}
        />
        <Bar dataKey={valueKey} radius={[0, 3, 3, 0]} maxBarSize={22}>
          {data.map((entry, index) => (
            <Cell key={String(entry.label) + index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
