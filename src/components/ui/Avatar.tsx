import { cn } from "@/lib/utils";

// Paleta restrita e neutra o suficiente para não competir com o verde da marca.
// dark: usa preenchimento translúcido em vez do tom "50" quase-branco, que
// destoaria de qualquer card escuro.
const PALETA = [
  { bg: "bg-sky-50 dark:bg-sky-500/15", text: "text-sky-700 dark:text-sky-400" },
  { bg: "bg-violet-50 dark:bg-violet-500/15", text: "text-violet-700 dark:text-violet-400" },
  { bg: "bg-amber-50 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-400" },
  { bg: "bg-forest-50 dark:bg-forest-500/15", text: "text-forest-700 dark:text-forest-300" },
  { bg: "bg-rust-50 dark:bg-rust-500/15", text: "text-rust-700 dark:text-rust-400" },
];

function corPorNome(nome: string) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA[Math.abs(hash) % PALETA.length];
}

interface AvatarProps {
  nome: string;
  size?: "sm" | "md" | "lg";
  statusDot?: string; // classe de cor de fundo do dot, ex "bg-forest-500"
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-2xl",
};

export function Avatar({ nome, size = "md", statusDot, className }: AvatarProps) {
  const cor = corPorNome(nome || "?");
  const iniciais = nome
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-display font-semibold",
          cor.bg,
          cor.text,
          sizes[size]
        )}
      >
        {iniciais || "?"}
      </div>
      {statusDot && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sand-surface",
            statusDot
          )}
        />
      )}
    </div>
  );
}
