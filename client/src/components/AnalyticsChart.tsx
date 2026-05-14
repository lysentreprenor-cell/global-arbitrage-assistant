import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

export function AnalyticsChart() {
  const { transactions } = useAppStore();

  const chartData = useMemo(() => {
    // Generate some mock data based on recent days to look good
    const data = [];
    const today = new Date();
    let balance = 12500; // Starting mock value

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Random variation for a nice curve
      const change = Math.floor(Math.random() * 2000) - 800;
      balance += change;

      data.push({
        name: date.toLocaleDateString('en-US', { weekday: 'short' }),
        value: balance > 0 ? balance : 1000, // keep it positive
      });
    }
    return data;
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="bg-card border border-white/5 rounded-3xl p-6 shadow-premium relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-primary/5 rounded-full blur-[60px] pointer-events-none"></div>
      
      <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h3 className="text-sm font-medium text-white/50 uppercase tracking-[0.2em] mb-1">
            Cash Flow
          </h3>
          <div className="text-2xl font-heading text-white flex items-center gap-2">
            +$2,450.00
            <span className="flex items-center text-[13px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full tracking-widest">
              <TrendingUp className="w-3 h-3 mr-1" />
              12%
            </span>
          </div>
        </div>
      </div>

      <div className="h-[140px] w-full relative z-10 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(43 74% 49%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(43 74% 49%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1A1A1A', 
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 500,
                boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
              }}
              itemStyle={{ color: 'hsl(43 74% 49%)' }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
              cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(43 74% 49%)" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorValue)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex justify-between mt-2 px-2 text-[12px] uppercase tracking-widest text-white/30 font-semibold relative z-10">
        {chartData.map((d, i) => (
          <span key={i}>{d.name}</span>
        ))}
      </div>
    </motion.div>
  );
}
