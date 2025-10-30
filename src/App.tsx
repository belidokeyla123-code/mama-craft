import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import NewCase from "./pages/NewCase";
import CaseDetail from "./pages/CaseDetail";
import ProtocoladasView from "./pages/ProtocoladasView";
import AcordosView from "./pages/AcordosView";
import SentencasView from "./pages/SentencasView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/novo-caso" element={<NewCase />} />
          <Route path="/caso/:id" element={<CaseDetail />} />
          <Route path="/protocoladas" element={<ProtocoladasView />} />
          <Route path="/acordos" element={<AcordosView />} />
          <Route path="/sentencas" element={<SentencasView />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
