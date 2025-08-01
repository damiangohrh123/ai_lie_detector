import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DeceptionTimeline({ timeline }) {
  
  // Format time for display. Show seconds only.
  const formatTime = (tick) => {
    const date = new Date(tick);
    return date.toLocaleTimeString().split(' ')[0];
  };

  return (
    <div className="deception-timeline-container">
      <ResponsiveContainer width="98%" height="90%">
        <LineChart data={timeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tickFormatter={formatTime} minTickGap={20} />
          <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} />
          <Tooltip labelFormatter={formatTime} formatter={v => `${Math.round(v * 100)}%`} />
          <Line type="monotone" dataKey="score" stroke="#d7263d" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
} 