import { Switch, Route } from "wouter";
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={ResellDashboard} />
        <Route path="/search" component={ResellSearch} />
        <Route path="/add" component={ResellAddProduct} />
        <Route path="/products" component={ResellProducts} />
        <Route path="/product/:id" component={ResellProductDetail} />
        <Route path="/profit/:id" component={ResellProfitPage} />
        <Route path="/compliance/:id" component={ResellCompliancePage} />
        <Route path="/offer/:id" component={ResellOfferPage} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}
