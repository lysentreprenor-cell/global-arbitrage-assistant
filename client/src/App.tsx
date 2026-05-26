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
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}
