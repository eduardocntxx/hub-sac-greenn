import { Avatar } from "hub-sac-greenn";

export const Tamanhos = () => (
  <div className="flex items-center gap-4 p-4">
    <Avatar nome="Ana Franca" size="sm" />
    <Avatar nome="Vittor Fernandes" size="md" />
    <Avatar nome="Nathalia Cavalcanti" size="lg" />
  </div>
);

export const ComStatus = () => (
  <div className="flex items-center gap-4 p-4">
    <Avatar nome="Amanda Felix" statusDot="bg-forest-500" />
    <Avatar nome="Ketlin Reis" statusDot="bg-amber-500" />
    <Avatar nome="Eduardo Nicolau" statusDot="bg-rust-500" />
  </div>
);

export const ModoEscuro = () => (
  <div className="dark">
    <div className="flex items-center gap-4 bg-sand-bg p-4">
      <Avatar nome="Ana Franca" />
      <Avatar nome="Vittor Fernandes" statusDot="bg-forest-500" />
      <Avatar nome="Nathalia Cavalcanti" />
      <Avatar nome="Amanda Felix" />
    </div>
  </div>
);
