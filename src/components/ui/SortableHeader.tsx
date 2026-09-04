import { ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<T extends string> {
  field: T;
  label: string;
  ordenarPor: T | undefined;
  direcao: "asc" | "desc";
  onSort: (field: T) => void;
  className?: string;
  align?: "left" | "center";
  title?: string;
}

// <th> clicável pra ordenar tabelas — clique alterna asc/desc no mesmo
// campo, ou troca de campo (sempre reiniciando na direção padrão dele).
export function SortableHeader<T extends string>({
  field,
  label,
  ordenarPor,
  direcao,
  onSort,
  className,
  align = "left",
  title,
}: SortableHeaderProps<T>) {
  const ativo = ordenarPor === field;
  return (
    <th className={cn("px-4 py-3 font-medium", align === "center" && "text-center", className)} title={title}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "flex items-center gap-1 whitespace-nowrap text-xs uppercase tracking-wide transition-colors",
          align === "center" && "mx-auto justify-center",
          ativo ? "text-forest-600" : "text-ink/50 hover:text-ink/80"
        )}
      >
        {label}
        {ativo ? (
          <ChevronDown
            size={12}
            className={cn("transition-transform duration-200", direcao === "asc" && "rotate-180")}
          />
        ) : (
          <ChevronsUpDown size={12} className="opacity-40" />
        )}
      </button>
    </th>
  );
}
