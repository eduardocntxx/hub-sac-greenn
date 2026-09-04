import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: "bg-forest-600 text-white hover:bg-forest-700 hover:shadow-card-hover",
  secondary:
    "bg-sand-surface text-ink border border-sand-line shadow-card hover:bg-sand-bg hover:shadow-card-hover",
  ghost: "bg-transparent text-ink hover:bg-sand-bg",
  danger: "bg-rust-500 text-white hover:bg-rust-600 hover:shadow-card-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
