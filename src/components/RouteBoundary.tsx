import { Component, Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";

function RouteFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-48" />
      <CardSkeleton />
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  // Quando muda (ex: pathname), limpa o erro — navegar pra outra página
  // não pode ficar preso na tela de erro da anterior.
  resetKey?: string;
}

class ErrorBoundary extends Component<BoundaryProps, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.erro && prev.resetKey !== this.props.resetKey) {
      this.setState({ erro: null });
    }
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-sand-line bg-sand-surface p-8 text-center">
        <p className="font-display text-base font-semibold text-ink">Não foi possível carregar esta página</p>
        <p className="mt-2 text-sm text-ink/60">
          Pode ser instabilidade de rede ou uma versão nova do Hub. Recarregar costuma resolver.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </div>
    );
  }
}

/** Suspense (esqueleto) + ErrorBoundary pra telas carregadas sob demanda. */
export function RouteBoundary({ children, resetKey }: BoundaryProps) {
  return (
    <ErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
