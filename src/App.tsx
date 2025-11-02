import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
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
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/novo-caso" element={<ProtectedRoute><NewCase /></ProtectedRoute>} />
          <Route path="/caso/:id" element={<ProtectedRoute><CaseDetail /></ProtectedRoute>} />
          <Route path="/protocoladas" element={<ProtectedRoute><ProtocoladasView /></ProtectedRoute>} />
          <Route path="/acordos" element={<ProtectedRoute><AcordosView /></ProtectedRoute>} />
          <Route path="/sentencas" element={<ProtectedRoute><SentencasView /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
