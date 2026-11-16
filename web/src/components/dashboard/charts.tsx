"use client";

// Charts drawn with recharts. Pages import them from lazy-charts.tsx, so the chart library loads after the page.

import { format, parseISO } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tooltipClass = "rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md";

/** Daily sign-ins as rounded bars, today's bar in full colour (theme 4). Colours come from CSS classes so both themes work. */
export function SigninsChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <div
      className="h-64 w-full text-primary [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border"
      role="img" aria-label={`Sign-ins over the last ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => format(parseISO(d), "d MMM")}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fontSize: 11 }}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className={tooltipClass}>
                  <p className="font-medium">{format(parseISO(payload[0].payload.date), "EEEE, d MMM")}</p>
                  <p className="text-muted-foreground"><span className="font-semibold text-foreground">{payload[0].value}</span> sign-ins</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3}>
            {data.map((d, i) => <Cell key={d.date} fill="currentColor" fillOpacity={i === data.length - 1 ? 1 : d.count ? 0.45 : 0.12} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Sign-ins per day</caption>
        <tbody>{data.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const SLICE = ["fill-chart-1", "fill-chart-2", "fill-chart-3", "fill-chart-4", "fill-chart-5", "fill-chart-6"];

/** The pie of the people-by-role donut; RolesDonut in lazy-charts.tsx draws it with its legend. */
export function RolesPie({ slices }: { slices: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive>
          {slices.map((s, i) => <Cell key={s.name} className={SLICE[i % SLICE.length]} />)}
        </Pie>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? <div className={tooltipClass}><span className="font-semibold">{payload[0].value}</span> {payload[0].name}</div> : null
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Share of students present per school day. One series, so no legend; the title names it. */
export function AttendanceTrendChart({ data }: { data: { date: string; percent: number | null }[] }) {
  const points = data.filter((d) => d.percent !== null) as { date: string; percent: number }[];
  const min = Math.max(0, Math.floor((Math.min(...points.map((p) => p.percent), 100) - 5) / 5) * 5);
  return (
    <div
      className="h-56 w-full text-primary [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border"
      role="img" aria-label={`Attendance over the last ${points.length} school days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="[stop-color:var(--primary)] [stop-opacity:0.22]" />
              <stop offset="100%" className="[stop-color:var(--primary)] [stop-opacity:0]" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(d: string) => format(parseISO(d), "d MMM")} tickLine={false} axisLine={false}
            interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 11 }} />
          <YAxis domain={[min, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.25 }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className={tooltipClass}>
                <p className="font-medium">{format(parseISO(payload[0].payload.date), "EEEE, d MMM")}</p>
                <p className="text-muted-foreground"><span className="font-semibold text-foreground">{payload[0].value}%</span> present</p>
              </div>
            ) : null}
          />
          <Area type="monotone" dataKey="percent" stroke="currentColor" strokeWidth={2} fill="url(#attFill)" dot={{ r: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, className: "stroke-card", fill: "currentColor" }} />
        </AreaChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Attendance per school day</caption>
        <tbody>{points.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.percent}%</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Fees collected per day. Thin bars, rounded at the data end only. */
export function CollectionChart({ data }: { data: { date: string; amount: number }[] }) {
  const inr = (v: number) => `₹${v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : v}`;
  return (
    <div
      className="h-60 w-full text-primary [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border"
      role="img" aria-label={`Fees collected per day over the last ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(d: string) => format(parseISO(d), "d MMM")} tickLine={false} axisLine={false}
            interval="preserveStartEnd" minTickGap={28} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={inr} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className={tooltipClass}>
                <p className="font-medium">{format(parseISO(payload[0].payload.date), "EEEE, d MMM")}</p>
                <p className="text-muted-foreground"><span className="font-semibold text-foreground">₹{Number(payload[0].value).toLocaleString("en-IN")}</span> collected</p>
              </div>
            ) : null}
          />
          <Bar dataKey="amount" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Fees collected per day</caption>
        <tbody>{data.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>₹{d.amount}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Income against expense per month: two bars a month, income in the primary colour. */
export function IncomeExpenseChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const inr = (v: number) => `₹${v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : v}`;
  return (
    <div className="h-64 w-full [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border"
      role="img" aria-label="Income and expense by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={(m: string) => format(parseISO(`${m}-01`), "MMM")} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={inr} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className={tooltipClass}>
                <p className="font-medium">{format(parseISO(`${payload[0].payload.month}-01`), "MMMM yyyy")}</p>
                <p>Income <span className="font-semibold">₹{Number(payload[0].payload.income).toLocaleString("en-IN")}</span></p>
                <p>Expense <span className="font-semibold">₹{Number(payload[0].payload.expense).toLocaleString("en-IN")}</span></p>
              </div>
            ) : null}
          />
          <Bar dataKey="income" className="fill-primary" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expense" className="fill-warning" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Income and expense by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expense</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.month}><th scope="row">{d.month}</th><td>₹{d.income}</td><td>₹{d.expense}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Fees collected per month: one bar a month. */
export function MonthlyCollectionChart({ data }: { data: { month: string; amount: number }[] }) {
  const inr = (v: number) => `₹${v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : v}`;
  const label = (m: string) => format(parseISO(`${m}-01`), "MMM yy");
  return (
    <div
      className="h-60 w-full text-primary [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border"
      role="img" aria-label="Fees collected per month over the last year">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickFormatter={label} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={inr} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={({ active, payload }) => active && payload?.length ? (
              <div className={tooltipClass}>
                <p className="font-medium">{format(parseISO(`${payload[0].payload.month}-01`), "MMMM yyyy")}</p>
                <p className="text-muted-foreground"><span className="font-semibold text-foreground">₹{Number(payload[0].value).toLocaleString("en-IN")}</span> collected</p>
              </div>
            ) : null}
          />
          <Bar dataKey="amount" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Fees collected per month</caption>
        <tbody>{data.map((d) => <tr key={d.month}><th scope="row">{d.month}</th><td>₹{d.amount}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
