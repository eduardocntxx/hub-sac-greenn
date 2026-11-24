// Quando a troca de tela termina. A transição marca ao começar; quem anima dentro da página
// (números rolando) espera esse tempo pra não disputar com o mergulho.
const DURACAO = 1000;
let fim = 0;

export function marcarTransicao() {
  fim = performance.now() + DURACAO;
}

/** Milissegundos até a troca de tela acabar (0 se não tem troca acontecendo). */
export function restoDaTransicao(): number {
  return Math.max(0, fim - performance.now());
}

// Login aceito: a primeira tela do app entra mergulhando (em vez de aparecer seca).
let veioDoLogin = false;
export function marcarEntradaDoLogin() {
  veioDoLogin = true;
}
export function entrouPeloLogin(): boolean {
  return veioDoLogin;
}
export function limparEntradaDoLogin() {
  veioDoLogin = false;
}
