import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, Plus, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useFeatures } from "@/hooks/useFeatures";
import { motion } from "framer-motion";
import UserHandleText from "@/components/UserHandleText";
import { useAdminAccess } from "@/hooks/useAdminAccess";

const POLL_INTERVAL_MS = 8000;

export default function Conversations() {
  const [, setLocation] = useLocation();
  const { conversations, user, refreshConversations } = useAppStore();
  const isMyMsg = (senderId: string) => senderId === "user" || (!!user && senderId === user.id);
  const { isEnabled } = useFeatures();
  const { isAdmin } = useAdminAccess();
  const [searchTerm, setSearchTerm] = useState("");

  // Poll for new conversations every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshConversations();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshConversations]);

  if (!isEnabled("messages")) {
    setLocation("/");
    return null;
  }

  const filteredConvos = conversations.filter(c => 
    c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.contactHandle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-screen bg-background relative overflow-hidden flex flex-col">
      <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <header className="px-6 pt-14 pb-4 sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 mr-4 hover:bg-secondary/80" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Button>
            <h1 className="text-2xl font-heading text-white/90">Messages</h1>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="ghost" size="icon" className="rounded-full bg-secondary border border-white/5 text-muted-foreground hover:bg-secondary/80 hover:text-white" onClick={() => setLocation("/users")} title="Katalog użytkowników">
                <Users className="w-5 h-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="rounded-full bg-primary/10 text-primary hover:bg-primary/20" onClick={() => setLocation("/messages/new")} data-testid="btn-new-message">
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="w-4 h-4" />
          </div>
          <input 
            type="text" 
            placeholder="Search conversations..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 pl-11 pr-4 bg-card border border-white/10 rounded-xl text-[15px] focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none"
          />
        </div>
      </header>

      <main className="px-6 py-4 relative z-10 flex-1 overflow-y-auto">
        {filteredConvos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6 shadow-inner-glow border border-white/5">
              <User className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-heading text-white/90 mb-2">No messages yet</h3>
            <p className="text-muted-foreground max-w-[200px] text-[15px]">Start a conversation by sending a transfer or a message.</p>
            <Button onClick={() => setLocation("/transfer?mode=message")} className="mt-6 rounded-xl font-semibold px-6 bg-primary text-primary-foreground">
              New Message
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredConvos.map((convo, i) => {
              const lastMessage = convo.messages[convo.messages.length - 1];
              const isUnread = convo.unreadCount > 0;
              
              // Generate consistent colors based on ID
              const colors = ['bg-blue-500/20 text-blue-400', 'bg-purple-500/20 text-purple-400', 'bg-emerald-500/20 text-emerald-400', 'bg-amber-500/20 text-amber-400', 'bg-rose-500/20 text-rose-400'];
              const colorIdx = parseInt(convo.contactId, 16) % colors.length || i % colors.length;
              const color = colors[colorIdx];
              
              const initials = convo.contactName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

              return (
                <motion.div 
                  key={convo.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setLocation(`/messages/${convo.id}`)}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-white/5 hover:bg-secondary/50 transition-colors cursor-pointer relative"
                >
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shadow-inner-glow border border-white/5 shrink-0 ${color}`}>
                    {initials}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className={`font-semibold text-[17px] truncate pr-2 ${isUnread ? 'text-white' : 'text-white/90'}`}>
                        {convo.contactName}
                      </h4>
                      <UserHandleText handle={convo.contactHandle} compact />
                      {lastMessage && (
                        <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(lastMessage.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center gap-2">
                      <p className={`text-[15px] truncate ${isUnread ? 'text-white font-medium' : 'text-muted-foreground'}`}>
                        {lastMessage?.isTransfer 
                          ? `${isMyMsg(lastMessage.senderId) ? 'You sent' : 'Sent you'} $${lastMessage.transferAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` 
                          : lastMessage?.text || 'New conversation'}
                      </p>
                      
                      {isUnread && (
                        <div className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 shadow-sm">
                          {convo.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
