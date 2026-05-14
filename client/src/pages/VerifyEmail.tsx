import { useEffect } from "react";
import { useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => setLocation("/"), 3000);
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-20 h-20 bg-card border border-primary/30 rounded-full flex items-center justify-center mb-6">
        <ShieldCheck className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">E-mail zweryfikowany</h1>
      <p className="text-muted-foreground text-center text-sm">
        Twoje konto jest aktywne. Za chwilę przejdziesz do aplikacji...
      </p>
    </div>
  );
}
