import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, User, Mail, Phone, MapPin, ShieldCheck, Check, Save, Camera, Loader2, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { uploadToCloudinaryMock, validateMedia } from "@/lib/media";

export default function AccountDetails() {
  const [, setLocation] = useLocation();
  const { user, updateUser } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const phone = (user as any)?.phone || "";
  const address = (user as any)?.address || "";
  const handle = user?.handle || "";

  const handleEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setSaveError("");
    // Strip @ prefix for editing handle
    setEditValue(field === "handle" ? currentValue.replace(/^@/, "") : (currentValue || ""));
  };

  const handleSave = async () => {
    if (!editingField || !user) return;
    setSaveError("");
    setIsSaving(true);
    try {
      let valueToSave = editValue.trim();
      if (!valueToSave && editingField !== "phone" && editingField !== "address") {
        setSaveError("Pole nie może być puste.");
        return;
      }

      // For handle — validate uniqueness via API before updating locally
      if (editingField === "handle") {
        const raw = valueToSave.replace(/^@/, "");
        if (raw.length < 3) { setSaveError("Host musi mieć co najmniej 3 znaki."); return; }
        const res = await fetch(`/api/users/handle/check?handle=${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (!data.available && data.handle !== user.handle) {
          setSaveError("Ten host jest już zajęty. Wybierz inny.");
          return;
        }
        valueToSave = data.handle; // normalized form with @
      }

      // Persist to server first (to catch conflicts)
      const patchRes = await fetch(`/api/user/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [editingField]: valueToSave }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        setSaveError(err.message || "Nie udało się zapisać.");
        return;
      }
      const updated = await patchRes.json();
      updateUser({ [editingField]: updated[editingField] ?? valueToSave });
      setEditingField(null);
      toast({ title: "Zaktualizowano", description: "Profil został pomyślnie zapisany." });
    } catch {
      setSaveError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditingField(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateMedia(file);
    if (!validation.valid) {
      toast({ title: "Błąd przesyłania", description: validation.error, variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const url = await uploadToCloudinaryMock(file, "item-prise/users/avatars");
      updateUser({ avatar: url });
      toast({ title: "Zdjęcie zaktualizowane" });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się przesłać zdjęcia.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fields = [
    { id: "handle", icon: AtSign, label: "Host / Identyfikator publiczny", value: handle, type: "text", prefix: "@", placeholder: "np. jan.kowalski" },
    { id: "name",   icon: User,   label: "Imię i Nazwisko",       value: user?.name,  type: "text" },
    { id: "email",  icon: Mail,   label: "Adres e-mail",          value: user?.email, type: "email" },
    { id: "phone",  icon: Phone,  label: "Numer telefonu",        value: phone,       type: "tel",  placeholder: "np. +48 123 456 789" },
    { id: "address",icon: MapPin, label: "Adres zamieszkania",    value: address,     type: "text",  placeholder: "np. ul. Kwiatowa 1, Warszawa" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/50">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/profile")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className="text-2xl font-heading text-white/90">Dane konta</h1>
      </header>

      <main className="px-6 py-8 space-y-8 relative z-10">

        {/* Avatar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div
              className="w-24 h-24 bg-secondary text-primary text-3xl font-bold rounded-[2rem] flex items-center justify-center uppercase border border-primary/20 shadow-inner-glow cursor-pointer relative overflow-hidden group"
              onClick={() => fileInputRef.current?.click()}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0) || "U"
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {isUploading ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : <Camera className="w-6 h-6 text-white" />}
              </div>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground p-1.5 rounded-full border-2 border-background pointer-events-none">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[12px] font-bold uppercase tracking-widest mb-1">
            <Check className="w-3.5 h-3.5" /> Tożsamość zweryfikowana
          </div>
          {handle && (
            <p className="text-sm font-mono font-semibold text-primary/80 mt-2">{handle}</p>
          )}
          <p className="text-[13px] text-muted-foreground uppercase tracking-widest mt-1">Klient od 2024</p>
        </motion.div>

        {/* Host highlight card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-primary/10 border border-primary/20 rounded-3xl p-5"
        >
          <div className="flex items-center gap-3 mb-1">
            <AtSign className="w-5 h-5 text-primary" />
            <p className="text-[12px] uppercase tracking-widest text-primary/70 font-bold">Twój Host (identyfikator)</p>
          </div>
          <p className="text-2xl font-bold font-mono text-primary">{handle || "Nie ustawiono"}</p>
          <p className="text-[13px] text-muted-foreground mt-1">Inni mogą Cię znaleźć po tym identyfikatorze</p>
        </motion.div>

        {/* Fields */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-white/5 rounded-3xl p-2 shadow-premium"
        >
          {fields.map((item, i) => (
            <div key={item.id} className={`p-5 flex items-start gap-5 ${i !== fields.length - 1 ? 'border-b border-white/5' : ''}`}>
              <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-primary shrink-0 border border-white/5 mt-0.5">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">{item.label}</p>
                <AnimatePresence mode="wait">
                  {editingField === item.id ? (
                    <motion.div key="editing" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="space-y-1 mt-1">
                      <div className="flex items-center gap-2">
                        {(item as any).prefix && (
                          <span className="text-primary font-bold text-base">{(item as any).prefix}</span>
                        )}
                        <Input
                          type={item.type}
                          value={editValue}
                          onChange={e => { setEditValue(e.target.value); setSaveError(""); }}
                          onKeyDown={handleKeyDown}
                          placeholder={(item as any).placeholder}
                          autoFocus
                          className="h-9 text-sm px-3 bg-background border-white/10"
                        />
                      </div>
                      {saveError && <p className="text-red-400 text-[13px]">{saveError}</p>}
                    </motion.div>
                  ) : (
                    <motion.p key="display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-medium text-[15px] text-white/90 truncate">
                      {item.value || <span className="text-muted-foreground/50 italic text-sm">Nie podano</span>}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <div className="shrink-0 mt-1">
                {editingField === item.id ? (
                  <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-3">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                ) : (
                  <Button variant="link" onClick={() => handleEdit(item.id, item.value || "")} className="text-primary text-[12px] font-bold uppercase tracking-widest p-0 h-auto opacity-70 hover:opacity-100">
                    Edytuj
                  </Button>
                )}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Bank account info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border border-white/5 rounded-3xl p-5 shadow-premium space-y-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <p className="text-[12px] uppercase tracking-widest text-muted-foreground font-bold">Konto bankowe</p>
          </div>
          {[
            { label: "Numer konta (IBAN)", value: "PL•• •••• •••• •••• •••• " + (user?.id?.slice(-4) || "0000") },
            { label: "SWIFT / BIC",         value: "FINLYSPLXXX" },
            { label: "Waluta konta",        value: "PLN" },
            { label: "Typ konta",           value: "Private Banking" },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center border-b border-white/5 pb-3 last:border-0 last:pb-0">
              <span className="text-[13px] text-muted-foreground">{row.label}</span>
              <span className="text-sm font-semibold text-white/90 font-mono">{row.value}</span>
            </div>
          ))}
        </motion.div>

      </main>
    </div>
  );
}
