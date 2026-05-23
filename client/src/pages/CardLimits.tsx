import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ShieldCheck, Save, CreditCard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function CardLimits() {
  const [, setLocation] = useLocation();
  const { user, updateSettings } = useAppStore();
  const { toast } = useToast();
  
  const defaultLimits = user?.settings?.cardLimits || { daily: 5000, monthly: 25000, atm: 1000 };
  
  const [dailyLimit, setDailyLimit] = useState(defaultLimits.daily);
  const [monthlyLimit, setMonthlyLimit] = useState(defaultLimits.monthly);
  const [atmLimit, setAtmLimit] = useState(defaultLimits.atm);

  useEffect(() => {
    if (user?.settings?.cardLimits) {
      setDailyLimit(user.settings.cardLimits.daily);
      setMonthlyLimit(user.settings.cardLimits.monthly);
      setAtmLimit(user.settings.cardLimits.atm);
    }
  }, [user?.settings?.cardLimits]);

  const handleSave = () => {
    updateSettings({
      cardLimits: {
        daily: dailyLimit,
        monthly: monthlyLimit,
        atm: atmLimit
      }
    });
    
    toast({ 
      title: "Limits Updated", 
      description: "Your new card security limits have been applied." 
    });
    setTimeout(() => setLocation("/cards"), 1000);
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/50">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/cards")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className="text-2xl font-heading text-white/90">Card Limits</h1>
      </header>

      <main className="px-6 py-8 space-y-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-white/5 rounded-3xl p-6 shadow-premium flex items-center gap-4"
        >
           <div className="w-16 h-12 rounded border border-primary/50 bg-primary/20 flex flex-col justify-between p-2 relative overflow-hidden shrink-0">
             <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 mix-blend-overlay"></div>
             <div className="w-4 h-3 bg-white/20 rounded-sm"></div>
             <div className="text-[6px] tracking-widest text-primary font-mono text-right">•••• 4289</div>
           </div>
           <div>
             <h3 className="font-semibold text-white/90">World Elite Card</h3>
             <p className="text-[13px] text-muted-foreground mt-0.5">Physical & Virtual</p>
           </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          <div className="bg-card border border-white/5 rounded-3xl p-6 shadow-premium space-y-8">
            {/* Daily Limit */}
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <h4 className="font-medium text-white/90 text-[15px]">Daily Spending</h4>
                  <p className="text-[13px] text-muted-foreground mt-1">Maximum allowed per day</p>
                </div>
                <div className="text-lg font-heading text-primary">${dailyLimit.toLocaleString()}</div>
              </div>
              <input 
                type="range" 
                min="500" 
                max="10000" 
                step="500" 
                value={dailyLimit} 
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-secondary rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[12px] text-muted-foreground font-semibold">
                <span>$500</span>
                <span>$10,000</span>
              </div>
            </div>

            {/* Monthly Limit */}
            <div className="space-y-4 border-t border-white/5 pt-6">
              <div className="flex justify-between items-end">
                <div>
                  <h4 className="font-medium text-white/90 text-[15px]">Monthly Budget</h4>
                  <p className="text-[13px] text-muted-foreground mt-1">Maximum allowed per month</p>
                </div>
                <div className="text-lg font-heading text-primary">${monthlyLimit.toLocaleString()}</div>
              </div>
              <input 
                type="range" 
                min="5000" 
                max="50000" 
                step="1000" 
                value={monthlyLimit} 
                onChange={(e) => setMonthlyLimit(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-secondary rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[12px] text-muted-foreground font-semibold">
                <span>$5,000</span>
                <span>$50,000</span>
              </div>
            </div>

            {/* ATM Limit */}
            <div className="space-y-4 border-t border-white/5 pt-6">
              <div className="flex justify-between items-end">
                <div>
                  <h4 className="font-medium text-white/90 text-[15px]">ATM Withdrawals</h4>
                  <p className="text-[13px] text-muted-foreground mt-1">Daily cash limit</p>
                </div>
                <div className="text-lg font-heading text-primary">${atmLimit.toLocaleString()}</div>
              </div>
              <input 
                type="range" 
                min="0" 
                max="5000" 
                step="100" 
                value={atmLimit} 
                onChange={(e) => setAtmLimit(Number(e.target.value))}
                className="w-full accent-primary h-1.5 bg-secondary rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[12px] text-muted-foreground font-semibold">
                <span>$0</span>
                <span>$5,000</span>
              </div>
            </div>
            
            {/* Online Transactions */}
            <div className="space-y-4 border-t border-white/5 pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-white/90 text-[15px]">Online Transactions</h4>
                  <p className="text-[13px] text-muted-foreground mt-1">Allow internet purchases</p>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer flex items-center p-1 transition-colors">
                  <div className="w-4 h-4 bg-background rounded-full absolute right-1 shadow-sm"></div>
                </div>
              </div>
            </div>

            {/* Contactless Payments */}
            <div className="space-y-4 border-t border-white/5 pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-white/90 text-[15px]">Contactless (NFC)</h4>
                  <p className="text-[13px] text-muted-foreground mt-1">Allow tap-to-pay</p>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer flex items-center p-1 transition-colors">
                  <div className="w-4 h-4 bg-background rounded-full absolute right-1 shadow-sm"></div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Button 
            onClick={handleSave}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-premium hover:bg-primary/90 text-lg flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            Apply New Limits
          </Button>
        </motion.div>
      </main>
    </div>
  );
}