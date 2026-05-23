import { useLocation } from "wouter";
import { ArrowLeft, MessageCircle, FileText, Phone, ShieldAlert, Send, Paperclip, X, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { useFeatures } from "@/hooks/useFeatures";
import { uploadToCloudinaryMock, validateMedia } from "@/lib/media";

export default function Support() {
  const [, setLocation] = useLocation();
  const { supportTickets, createSupportTicket, addSupportMessage } = useAppStore();
  const { isEnabled } = useFeatures();
  const { toast } = useToast();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!isEnabled("support")) {
    setLocation("/");
    return null;
  }

  const activeTicket = supportTickets.find(t => t.id === activeTicketId);
  
  const openNewTicket = () => {
    setActiveTicketId(null);
    setAttachments([]);
    setMessage("");
    setIsChatOpen(true);
  };

  const openExistingTicket = (id: string) => {
    setActiveTicketId(id);
    setAttachments([]);
    setMessage("");
    setIsChatOpen(true);
    // Scroll to bottom after open
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMedia(file);
    if (!validation.valid) {
      toast({ title: "Upload Failed", description: validation.error, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadToCloudinaryMock(file, "item-prise/support/attachments");
      setAttachments(prev => [...prev, url]);
      toast({ title: "File Attached", description: "Attachment ready to send." });
    } catch (error) {
      toast({ title: "Upload Failed", description: "Could not upload file.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && attachments.length === 0) return;

    if (activeTicketId) {
      addSupportMessage(activeTicketId, message, attachments.length > 0 ? attachments : undefined);
    } else {
      const newId = createSupportTicket("General Inquiry", message, attachments.length > 0 ? attachments : undefined);
      setActiveTicketId(newId);
    }
    
    setMessage("");
    setAttachments([]);
    
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  return (
    <div className="min-h-screen bg-background pb-24 relative overflow-x-hidden flex flex-col">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-6 flex items-center sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-border/50">
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/profile")}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Button>
        <h1 className="text-2xl font-heading text-white/90">Concierge Support</h1>
      </header>

      <main className="px-6 py-8 space-y-8 relative z-10 flex-1">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-primary/20 rounded-3xl p-8 shadow-premium text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner-glow rotate-3">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-heading mb-2 text-white">Priority Assistance</h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">Your dedicated private client team is available 24/7 to resolve any queries.</p>
            <Button 
              className="w-full h-14 rounded-2xl text-[13px] uppercase tracking-widest font-bold shadow-premium"
              onClick={openNewTicket}
            >
              Connect to Advisor
            </Button>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-white/5 rounded-3xl p-2 shadow-premium"
        >
          {[
            { icon: Phone, label: "Direct Line", desc: "Speak instantly with an agent", onClick: () => toast({ title: "Calling...", description: "+1 (800) PRIVATE" }) },
            { icon: FileText, label: "Knowledge Base", desc: "Explore detailed guides", onClick: () => toast({ title: "Knowledge Base", description: "Opening help center..." }) },
            { icon: ShieldAlert, label: "Report Issue", desc: "Flag a transaction or app issue", onClick: () => toast({ title: "Report Started", description: "Please select the transaction in your history." }) },
          ].map((item, i, arr) => (
            <div 
              key={i} 
              onClick={item.onClick}
              className={`p-5 flex items-center justify-between cursor-pointer hover:bg-secondary/50 transition-colors group ${i !== arr.length - 1 ? 'border-b border-white/5' : ''}`}
            >
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-primary shrink-0 border border-white/5 shadow-inner-glow group-hover:scale-105 transition-transform">
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] text-white/90">{item.label}</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>
          ))}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center px-2">
            <h3 className="font-heading text-lg text-white/90">Active Requests</h3>
            <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-[13px] font-semibold">{supportTickets.length}</span>
          </div>
          <div className="bg-card border border-white/5 rounded-3xl p-5 shadow-premium flex flex-col gap-4">
            {supportTickets.length === 0 ? (
               <p className="text-sm text-muted-foreground text-center py-4">No active requests.</p>
            ) : (
              supportTickets.map((ticket, i) => (
                <div key={ticket.id} className="flex flex-col gap-4 group cursor-pointer" onClick={() => openExistingTicket(ticket.id)}>
                  {i > 0 && <div className="h-px bg-white/5 w-full"></div>}
                  <div className={`flex items-center justify-between transition-opacity ${ticket.status === 'closed' || ticket.status === 'resolved' ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${ticket.status === 'open' || ticket.status === 'pending' ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
                      <div>
                        <h4 className="font-semibold text-[15px] text-white/90 group-hover:text-primary transition-colors">{ticket.title}</h4>
                        <p className="text-[13px] text-muted-foreground mt-0.5">
                          {ticket.status === 'open' ? 'In Review' : ticket.status === 'resolved' ? 'Resolved' : ticket.status} 
                          • {new Date(ticket.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className={`text-[13px] font-semibold uppercase tracking-widest px-2 py-1 rounded-md ${
                      ticket.status === 'open' || ticket.status === 'pending' 
                        ? 'text-amber-500 bg-amber-500/10' 
                        : 'text-green-500 bg-green-500/10'
                    }`}>
                      {ticket.status}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            className="fixed inset-0 z-50 bg-background flex flex-col sm:max-w-md sm:mx-auto sm:shadow-2xl sm:border-x border-border/40"
          >
            <header className="px-6 pt-14 pb-4 bg-card border-b border-white/5 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center">
                <Button variant="ghost" size="icon" className="mr-4 rounded-full bg-secondary hover:bg-secondary/80" onClick={() => setIsChatOpen(false)}>
                  <ArrowLeft className="w-5 h-5 text-foreground" />
                </Button>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary border border-primary/30 shadow-inner-glow">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card"></div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[15px] text-white/90">{activeTicketId ? activeTicket?.title : 'New Inquiry'}</h3>
                    <p className="text-[13px] text-muted-foreground font-medium">Concierge Desk</p>
                  </div>
                </div>
              </div>
              {activeTicketId && activeTicket?.status !== 'resolved' && (
                <Button variant="outline" size="sm" className="text-[13px] font-semibold tracking-widest uppercase bg-transparent border-white/10 hover:bg-white/5">
                  Resolve
                </Button>
              )}
            </header>
            
            <div className="flex-1 p-6 overflow-y-auto bg-background flex flex-col gap-4 relative" ref={scrollRef}>
              <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2"></div>
              
              <div className="text-center text-[13px] text-muted-foreground my-2 font-medium bg-card/50 backdrop-blur-sm self-center px-3 py-1 rounded-full border border-white/5 shadow-sm">
                {activeTicketId ? new Date(activeTicket?.updatedAt || Date.now()).toLocaleDateString() : 'Today'}
              </div>
              
              {!activeTicketId && (
                <div className="bg-card border border-white/5 rounded-2xl rounded-tl-sm p-4 max-w-[85%] self-start shadow-sm mt-4">
                  <p className="text-[15px] text-white/90">Hello! I'm your dedicated private banking advisor. How can I assist you with your portfolio today?</p>
                </div>
              )}

              {activeTicket?.messages.map((msg) => (
                <div key={msg.id} className={`max-w-[85%] ${msg.senderId === 'user' ? 'self-end' : 'self-start'}`}>
                  <div className={`rounded-2xl p-4 shadow-sm ${
                    msg.senderId === 'user' 
                      ? 'bg-primary text-primary-foreground rounded-br-sm' 
                      : 'bg-card border border-white/5 text-white/90 rounded-tl-sm'
                  }`}>
                    {msg.text && <p className="text-[15px] leading-relaxed">{msg.text}</p>}
                    
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`flex flex-col gap-2 ${msg.text ? 'mt-3' : ''}`}>
                        {msg.attachments.map((url, idx) => (
                          <div key={idx} className="rounded-xl overflow-hidden border border-white/10 relative group">
                            {url.includes('pdf') || url.includes('document') ? (
                               <div className="bg-black/20 p-4 flex items-center gap-3 backdrop-blur-md">
                                 <FileText className="w-6 h-6" />
                                 <span className="text-sm font-medium truncate">Document attached</span>
                               </div>
                            ) : (
                              <img src={url} alt="Attachment" className="w-full h-auto max-h-[200px] object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={`text-[12px] mt-1.5 font-medium text-muted-foreground ${msg.senderId === 'user' ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-card border-t border-white/5 pb-8 sm:pb-4 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)] z-10 relative">
              {attachments.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                  {attachments.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-sm">
                      {url.includes('pdf') ? (
                         <div className="w-full h-full bg-secondary flex items-center justify-center"><FileText className="w-6 h-6 text-primary" /></div>
                      ) : (
                        <img src={url} alt="Preview" className="w-full h-full object-cover opacity-60" />
                      )}
                      <button 
                        type="button" 
                        onClick={() => removeAttachment(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 hover:bg-black/80 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2 items-end">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-12 w-12 rounded-xl shrink-0 text-muted-foreground hover:text-white bg-secondary/50 border border-white/5 relative shadow-inner-glow"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || (!!activeTicketId && activeTicket?.status === 'resolved')}
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/jpeg,image/png,image/webp,application/pdf" 
                  onChange={handleFileUpload}
                />
                
                <Input 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={activeTicketId && activeTicket?.status === 'resolved' ? "Ticket resolved" : "Type your message..."}
                  className="h-12 bg-secondary border-white/10 rounded-xl shadow-inner-glow focus:border-primary/50 transition-colors text-[15px]"
                  disabled={activeTicketId && activeTicket?.status === 'resolved' ? true : false}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="h-12 w-12 rounded-xl shrink-0 bg-primary text-primary-foreground shadow-premium hover:bg-primary/90 transition-colors" 
                  disabled={isUploading || (!message.trim() && attachments.length === 0) || (activeTicketId && activeTicket?.status === 'resolved' ? true : false)}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}