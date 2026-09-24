import { PasswordInput } from "hub-sac-greenn";

export const Campo = () => (
  <div className="flex w-[360px] flex-col gap-1.5 p-4">
    <label htmlFor="senha" className="text-sm font-medium text-ink">Senha</label>
    <PasswordInput id="senha" placeholder="Mínimo de 8 caracteres" defaultValue="greenn2026" />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="flex w-[360px] flex-col gap-1.5 bg-sand-bg p-4">
      <label htmlFor="senha-escuro" className="text-sm font-medium text-ink">Senha</label>
      <PasswordInput id="senha-escuro" placeholder="Mínimo de 8 caracteres" />
    </div>
  </div>
);
