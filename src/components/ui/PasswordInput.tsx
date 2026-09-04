import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Campo de senha com botão de olho pra mostrar/ocultar — único lugar que
// implementa essa lógica; nunca duplicar type="password" solto com estado
// próprio em outra tela.
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const [visivel, setVisivel] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visivel ? "text" : "password"}
          className={cn(
            "w-full rounded-lg border border-sand-line bg-sand-surface px-3 py-2 pr-10 text-sm outline-none transition-shadow focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20",
            className
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisivel((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70"
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        >
          {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
