import { LineChart, Line, Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function DeceptionTimeline({ timeline, currentScore = null }) {

  // Format time for display. Show seconds only.
  const formatTime = (tick) => {
    const date = new Date(tick);
    return date.toLocaleTimeString().split(' ')[0];
  };

  return (
    <div className="deception-timeline-container">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={timeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#19df62ff" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#19df62ff" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis dataKey="time" tickFormatter={formatTime} minTickGap={20} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={formatTime} formatter={v => `${Math.round(v * 100)}%`} />

          <Area
            type="monotone"
            dataKey="score"
            connectNulls={true}
            baseValue={0}
            stroke="transparent"
            fill="url(#scoreGradient)"
            dot={false}
            isAnimationActive={false}
          />

          <Line
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
