import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

import ResellDashboard from "@/pages/resell/Dashboard";
import ResellSearch from "@/pages/resell/Search";
import ResellAddProduct from "@/pages/resell/AddProduct";
import ResellProducts from "@/pages/resell/Products";
import ResellProductDetail from "@/pages/resell/ProductDetail";
import ResellProfitPage from "@/pages/resell/ProfitPage";
import ResellCompliancePage from "@/pages/resell/CompliancePage";
import ResellOfferPage from "@/pages/resell/OfferPage";
import MarketScan from "@/pages/resell/MarketScan";
import DropshipManager from "@/pages/resell/DropshipManager";
import PlatformCompare from "@/pages/resell/PlatformCompare";
import Settings from "@/pages/resell/Settings";
import ResellSavedPage from "@/pages/resell/SavedPage";
import AutopilotPage from "@/pages/resell/AutopilotPage";
import PhotoListingPage from "@/pages/resell/PhotoListingPage";
import AlertsPage from "@/pages/resell/AlertsPage";
import QuickListPage from "@/pages/resell/QuickListPage";
import TrendsPage from "@/pages/resell/TrendsPage";
import MarketingPage from "@/pages/resell/MarketingPage";
import AgentPage from "@/pages/resell/AgentPage";
import PLDashboard from "@/pages/resell/PLDashboard";
import SuppliersPage from "@/pages/resell/SuppliersPage";
import CompetitorTracker from "@/pages/resell/CompetitorTracker";
import TradingBot from "@/pages/resell/TradingBot";

function RedirectToResell() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/resell"); }, []);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={RedirectToResell} />
        <Route path="/resell" component={ResellDashboard} />
        <Route path="/resell/search" component={ResellSearch} />
        <Route path="/resell/add" component={ResellAddProduct} />
        <Route path="/resell/products" component={ResellProducts} />
        <Route path="/resell/product/:id" component={ResellProductDetail} />
        <Route path="/resell/profit/:id" component={ResellProfitPage} />
        <Route path="/resell/compliance/:id" component={ResellCompliancePage} />
        <Route path="/resell/offer/:id" component={ResellOfferPage} />
        <Route path="/resell/market-scan" component={MarketScan} />
        <Route path="/resell/dropship" component={DropshipManager} />
        <Route path="/resell/compare" component={PlatformCompare} />
        <Route path="/resell/saved" component={ResellSavedPage} />
        <Route path="/resell/autopilot" component={AutopilotPage} />
        <Route path="/resell/settings" component={Settings} />
        <Route path="/resell/photo" component={PhotoListingPage} />
        <Route path="/resell/alerts" component={AlertsPage} />
        <Route path="/resell/quick-list" component={QuickListPage} />
        <Route path="/resell/trends" component={TrendsPage} />
        <Route path="/resell/pnl" component={PLDashboard} />
        <Route path="/resell/suppliers" component={SuppliersPage} />
        <Route path="/resell/competitors" component={CompetitorTracker} />
        <Route path="/resell/marketing" component={MarketingPage} />
        <Route path="/resell/agent" component={AgentPage} />
        <Route path="/resell/trading-bot" component={TradingBot} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}
