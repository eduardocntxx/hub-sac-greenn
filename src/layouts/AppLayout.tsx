import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { useRealtimeAnnouncementsNotifier } from "@/hooks/useRealtimeAnnouncementsNotifier";
import { useCascata } from "@/hooks/useCascata";
import { RouteBoundary } from "@/components/RouteBoundary";
import { TransicaoTela } from "@/components/TransicaoTela";

function AppLayoutInner() {
  useRealtimeAnnouncementsNotifier();
  useCascata();

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
          {/* #conteudo-tela recua quando um pop-up abre (Dialog vai num portal no body). */}
          <div id="conteudo-tela" className="mx-auto w-full max-w-[1600px] print:max-w-none">
            <TransicaoTela embrulho={(filho, chave) => <RouteBoundary resetKey={chave}>{filho}</RouteBoundary>} />
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
