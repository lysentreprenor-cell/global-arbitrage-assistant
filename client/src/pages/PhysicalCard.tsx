import { useLocation } from "wouter";
import { ArrowLeft, Package, MapPin, Truck, CheckCircle2, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function PhysicalCard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleActivate = () => {
    toast({
      title: "Scanner Opened",
      description: "Looking for QR code or NFC tag..."
    });
    // Simulate activation flow
    setTimeout(() => {
      toast({
        title: "Card Activated",
        description: "Your physical card is now ready to use."
      });
      setLocation("/cards");
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/cards")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className="text-xl font-heading text-white/90">Card Tracking</h1>
      </header>

      <main className="px-6 py-6 relative z-10 space-y-8">
        {/* Card Preview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full aspect-[1.58] rounded-3xl bg-gradient-to-br from-[#1A1A1A] to-[#0A0A0A] border border-white/10 p-8 flex flex-col justify-between text-white overflow-hidden shadow-2xl mx-auto max-w-sm"
        >
          {/* Metal Texture */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20 mix-blend-overlay pointer-events-none"></div>
          <div className="absolute -left-20 top-0 w-48 h-full bg-white/5 rotate-45 transform pointer-events-none"></div>
          
          <div className="flex justify-between items-start relative z-10">
            <span className="text-[13px] font-semibold uppercase tracking-[0.15em] text-white/50">Solid Metal</span>
            <div className="w-10 h-8 rounded border border-white/20 bg-white/10 flex items-center justify-center overflow-hidden">
               <div className="w-full h-[1px] bg-white/20"></div>
            </div>
          </div>
          
          <div className="relative z-10 mt-auto">
            <div className="text-[14px] tracking-widest font-mono font-light text-white/80 mb-4">
              JANE DOE
            </div>
          </div>
        </motion.div>

        {/* Tracking Timeline */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-white/5 rounded-3xl p-6 shadow-premium"
        >
          <h3 className="font-heading text-lg text-white/90 mb-6">Delivery Status</h3>
          
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary before:via-white/10 before:to-transparent">
            {/* Step 1 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shadow shrink-0 z-10">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] ml-4 md:ml-0 md:mr-4">
                <h4 className="font-semibold text-white/90">Card Manufactured</h4>
                <p className="text-[13px] text-muted-foreground mt-1">Personalized and polished.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shadow shrink-0 z-10">
                <Truck className="w-5 h-5" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] ml-4 md:ml-0 md:mr-4">
                <h4 className="font-semibold text-white/90">In Transit</h4>
                <p className="text-[13px] text-muted-foreground mt-1">FedEx Priority. Arriving tomorrow.</p>
                <div className="mt-2 text-[13px] font-mono text-primary bg-primary/10 inline-block px-2 py-1 rounded">TRK-98234759</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-secondary text-muted-foreground shadow shrink-0 z-10">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] ml-4 md:ml-0 md:mr-4 opacity-50">
                <h4 className="font-semibold text-white/90">Delivery</h4>
                <p className="text-[13px] text-muted-foreground mt-1">123 Financial Ave, NY</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Activation Section */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-white/5 rounded-3xl p-5 shadow-premium flex items-center gap-4 cursor-pointer hover:bg-secondary/50 transition-colors"
          onClick={handleActivate}
        >
          <div className="w-12 h-12 rounded-2xl bg-secondary border border-white/5 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-[15px] text-white/90">Activate New Card</h4>
            <p className="text-[13px] text-muted-foreground mt-0.5">Scan QR code when it arrives</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </main>
    </div>
  );
}
