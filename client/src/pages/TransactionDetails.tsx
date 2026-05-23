import { useLocation, useParams } from "wouter";
import { ArrowLeft, Download, FileText, MapPin, Tag, Share, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function TransactionDetails() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { transactions } = useAppStore();
  const { toast } = useToast();

  const transaction = transactions.find(t => t.id === id);

  if (!transaction) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-4 border border-white/5">
          <Info className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-heading text-white">Transaction not found</h2>
        <p className="text-muted-foreground mt-2 mb-6">The transaction you are looking for does not exist or has been removed.</p>
        <Button onClick={() => setLocation("/history")} variant="outline" className="rounded-xl border-white/10 bg-secondary">
          Back to History
        </Button>
      </div>
    );
  }

  const isPositive = transaction.amount > 0;
  const formattedDate = new Date(transaction.date).toLocaleDateString(undefined, { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleDownload = () => {
    toast({
      title: "Receipt Downloaded",
      description: "Transaction receipt PDF has been saved to your device."
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-x-hidden flex flex-col">
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-6 flex items-center justify-between sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => window.history.back()}>
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <h1 className="text-xl font-heading text-white/90">Transaction Details</h1>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-white" onClick={handleDownload}>
          <Download className="w-5 h-5" />
        </Button>
      </header>

      <main className="px-6 py-8 relative z-10 flex-1 space-y-6">
        {/* Amount & Status Header */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center space-y-2 mb-4"
        >
          <div className="w-16 h-16 rounded-3xl bg-secondary shadow-inner-glow border border-white/5 flex items-center justify-center mb-2">
            <span className="text-2xl">{isPositive ? '⬇️' : '↗️'}</span>
          </div>
          <h2 className="text-4xl font-heading font-light tracking-tight text-white flex items-baseline justify-center gap-1">
            <span className="text-2xl text-white/50">{isPositive ? '+' : ''}$</span>
            {Math.abs(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h2>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[12px] font-bold uppercase tracking-widest mt-2">
            Completed
          </div>
        </motion.div>

        {/* Details Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-white/5 rounded-3xl shadow-premium overflow-hidden"
        >
          <div className="p-5 border-b border-white/5 flex items-start gap-4">
            <div className="w-12 h-12 bg-secondary rounded-2xl flex flex-col items-center justify-center border border-white/5 shrink-0 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white/90">{transaction.title}</h3>
              <p className="text-sm text-muted-foreground">{transaction.subtitle}</p>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Tag className="w-4 h-4" /> Category
              </span>
              <span className="text-sm font-medium text-white/90 capitalize">{transaction.category || 'General'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Location
              </span>
              <span className="text-sm font-medium text-white/90">Online / App</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Date & Time</span>
              <span className="text-sm font-medium text-white/90 text-right">{formattedDate}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Reference</span>
              <span className="text-[12px] font-mono font-medium text-white/70">TXN-{transaction.id.toUpperCase()}</span>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-3"
        >
          <Button 
            variant="outline" 
            className="h-14 rounded-2xl bg-card border-white/5 hover:bg-secondary flex gap-2 font-semibold text-[13px] tracking-widest uppercase"
            onClick={handleDownload}
          >
            <Download className="w-4 h-4" /> Receipt
          </Button>
          <Button 
            variant="outline" 
            className="h-14 rounded-2xl bg-card border-white/5 hover:bg-secondary flex gap-2 font-semibold text-[13px] tracking-widest uppercase"
            onClick={() => toast({ title: "Share Link Copied", description: "Transaction link copied to clipboard." })}
          >
            <Share className="w-4 h-4" /> Share
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
