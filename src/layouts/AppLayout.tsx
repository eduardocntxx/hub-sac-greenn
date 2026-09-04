import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { useRealtimeAnnouncementsNotifier } from "@/hooks/useRealtimeAnnouncementsNotifier";

function AppLayoutInner() {
  useRealtimeAnnouncementsNotifier();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-sand-bg print:block print:h-auto">
      <div className="fixed inset-y-0 left-0 z-30 print:hidden">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden pl-[72px] print:block print:overflow-visible print:pl-0">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6 print:h-auto print:overflow-visible print:p-0">
          <div className="mx-auto w-full max-w-[1600px] print:max-w-none">
            {/* Troca de rota anima com opacity+margin, nunca transform — esta
                div envolve toda página, inclusive a Reunião de Resultados,
                cujo relatório usa position:fixed em tela cheia; um transform
                aqui viraria o containing block desse fixed e quebraria o
                overlay de impressão. */}
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, marginTop: -8 }}
              animate={{ opacity: 1, marginTop: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="print:m-0"
            >
              <Outlet />
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <NotificationsProvider>
      <ToastProvider>
        <AppLayoutInner />
      </ToastProvider>
    </NotificationsProvider>
  );
}
