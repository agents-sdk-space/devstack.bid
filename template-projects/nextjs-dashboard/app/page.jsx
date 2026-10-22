"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function series(days) {
  return Array.from({ length: days }, (_, i) => ({ day: `D${i + 1}`, users: Math.round(120 + 40 * Math.sin(i / 2) + i * 6) }));
}

export default function Dashboard() {
  const [range, setRange] = useState(14);
  const data = useMemo(() => series(range), [range]);
  const total = data.reduce((n, d) => n + d.users, 0);
  return (
    <main>
      <h1>__TITLE__</h1>
      <p className="muted">__DESCRIPTION__</p>
      <div className="range" role="group" aria-label="Range">
        {[7, 14, 30].map((d) => (
          <button key={d} type="button" aria-pressed={range === d} onClick={() => setRange(d)}>{d} days</button>
        ))}
      </div>
      <section className="grid" aria-label="KPIs">
        <div className="card"><p>Total visits</p><strong>{total.toLocaleString()}</strong></div>
        <div className="card"><p>Daily average</p><strong>{Math.round(total / range)}</strong></div>
        <div className="card"><p>Peak day</p><strong>{Math.max(...data.map((d) => d.users))}</strong></div>
      </section>
      <section className="card chart" aria-label="Visits chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="users" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </main>
  );
}
