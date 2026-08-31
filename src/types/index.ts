export type UserRole = "administrador" | "colaborador";

export type UserStatus = "ativo" | "inativo";

export interface AppUser {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  equipe: string;
  avatarUrl?: string;
  status: UserStatus;
  perfil: UserRole;
  aprovado: boolean;
}
