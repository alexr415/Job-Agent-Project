"use client";

import { useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SkillBar, TrendPoint } from "@/lib/dashboard";

// Categorical slots from the dataviz reference palette, validated in both
// modes (scripts/validate_palette.js): 2 slots for the bars, 4 for the lines.
// Light-mode aqua and yellow are under 3:1 on the surface, so the trend chart
// carries direct labels and a table view.
const THEME = {
  light: {
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
    text: "#52514e",
    muted: "#8a8984",
    grid: "#e8e7e3",
    surface: "#ffffff",
  },
  dark: {
    series: ["#3987e5", "#d95926", "#199e70", "#c98500"],
    text: "#c3c2b7",
    muted: "#8f8e86",
    grid: "#2c2c2a",
    surface: "#0a0a0a",
  },
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

// SVG fill attributes can't read CSS variables reliably, so pick hex values in JS
// and re-render when the OS theme changes.
function useTheme() {
  const dark = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DARK_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  return dark ? THEME.dark : THEME.light;
}

const tooltipClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-neutral-800 dark:bg-neutral-950";

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;
}

function TableToggle({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
        Show as table
      </summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  );
}

const th = "py-1.5 pr-3 text-left text-xs font-medium uppercase tracking-wide text-neutral-500";
const td = "py-1.5 pr-3 tabular-nums";

// Horizontal bars: each skill's share of open roles, colored by whether the
// resume already covers it.
export function SkillDemandChart({ data }: { data: SkillBar[] }) {
  const theme = useTheme();
  const [have, missing] = [theme.series[0], theme.series[1]];

  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Swatch color={have} /> On your resume
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch color={missing} /> Not on your resume
        </span>
      </div>
      <div style={{ height: data.length * 28 + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={theme.grid} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: theme.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="skill"
              width={160}
              tick={{ fill: theme.text, fontSize: 12 }}
              axisLine={{ stroke: theme.grid }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: theme.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as SkillBar | undefined);
                if (!d) return null;
                return (
                  <div className={tooltipClass}>
                    <p className="mb-1 flex items-center gap-1.5 font-medium">
                      <Swatch color={d.onResume ? have : missing} />
                      {d.skill}
                    </p>
                    <p>
                      {d.share}% of roles ({d.roles}), {d.required} require it
                    </p>
                    <p className="text-neutral-500">Asked by {d.companies.slice(0, 4).join(", ")}
                      {d.companies.length > 4 && ` +${d.companies.length - 4} more`}
                    </p>
                    <p className="text-neutral-500">{d.onResume ? "On your resume" : "Not on your resume"}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="share" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.skill} fill={d.onResume ? have : missing} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className={th}>Skill</th>
              <th className={th}>Share of roles</th>
              <th className={th}>Roles</th>
              <th className={th}>Require it</th>
              <th className={th}>On resume</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.skill} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                <td className={td}>{d.skill}</td>
                <td className={td}>{d.share}%</td>
                <td className={td}>{d.roles}</td>
                <td className={td}>{d.required}</td>
                <td className={td}>{d.onResume ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </figure>
  );
}

const TREND_HEIGHT = 256;
const TREND_MARGIN_TOP = 8;
const X_AXIS_HEIGHT = 30; // Recharts' default
const LABEL_GAP_PX = 13; // minimum vertical distance between end-of-line labels

// Spreads the end-of-line labels so none sit closer than LABEL_GAP_PX, and
// returns each label's pixel offset from its line's last point. Works because
// the y domain is fixed, so a percentage point maps to a known number of pixels.
function labelOffsets(ends: { skill: string; value: number }[], pxPerUnit: number): Map<string, number> {
  const sorted = [...ends].sort((a, b) => b.value - a.value); // top of chart first
  const placed: { skill: string; y: number; natural: number }[] = [];
  for (const { skill, value } of sorted) {
    const natural = -value * pxPerUnit; // pixels, smaller is higher up
    const prev = placed.at(-1);
    placed.push({ skill, natural, y: prev ? Math.max(natural, prev.y + LABEL_GAP_PX) : natural });
  }
  return new Map(placed.map((p) => [p.skill, p.y - p.natural]));
}

// Lines: the current top skills' share of roles in each report over time.
export function SkillTrendChart({ skills, points }: { skills: string[]; points: TrendPoint[] }) {
  const theme = useTheme();
  const last = points.length - 1;

  // Fixed y domain (0 to the next multiple of 15), so label spacing can be computed in pixels.
  const max = Math.max(...points.flatMap((p) => skills.map((s) => Number(p[s] ?? 0))));
  const domainMax = Math.max(15, Math.ceil(max / 15) * 15);
  const ticks = Array.from({ length: domainMax / 15 + 1 }, (_, i) => i * 15);
  const plotHeight = TREND_HEIGHT - TREND_MARGIN_TOP - X_AXIS_HEIGHT;
  const offsets = labelOffsets(
    skills.filter((s) => points[last]?.[s] !== undefined).map((s) => ({ skill: s, value: Number(points[last][s]) })),
    plotHeight / domainMax,
  );

  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-neutral-600 dark:text-neutral-400">
        {skills.map((skill, i) => (
          <span key={skill} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: theme.series[i] }} />
            {skill}
          </span>
        ))}
      </div>
      <div style={{ height: TREND_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: TREND_MARGIN_TOP, right: 96, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis
              dataKey="label"
              height={X_AXIS_HEIGHT}
              tick={{ fill: theme.muted, fontSize: 11 }}
              axisLine={{ stroke: theme.grid }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: theme.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
              domain={[0, domainMax]}
              ticks={ticks}
            />
            <Tooltip
              cursor={{ stroke: theme.muted, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className={tooltipClass}>
                    <p className="mb-1 font-medium">Report {label}</p>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="flex items-center gap-1.5">
                        <Swatch color={String(p.color)} />
                        {String(p.dataKey)}: {String(p.value)}%
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {skills.map((skill, i) => (
              <Line
                key={skill}
                dataKey={skill}
                stroke={theme.series[i]}
                strokeWidth={2}
                dot={{ r: 4, fill: theme.series[i], stroke: theme.surface, strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls
              >
                {/* Direct label at the line's end, in text ink rather than the series color. */}
                <LabelList
                  dataKey={skill}
                  content={({ x, y, index }) =>
                    index === last ? (
                      <text
                        x={Number(x) + 10}
                        y={Number(y) + (offsets.get(skill) ?? 0)}
                        dy={4}
                        fill={theme.text}
                        fontSize={11}
                      >
                        {skill}
                      </text>
                    ) : null
                  }
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className={th}>Report</th>
              {skills.map((s) => (
                <th key={s} className={th}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                <td className={td}>{p.label}</td>
                {skills.map((s) => (
                  <td key={s} className={td}>
                    {p[s] === undefined ? "–" : `${p[s]}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </figure>
  );
}
