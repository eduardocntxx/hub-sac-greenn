// Aplica o tema antes do primeiro paint, pra não piscar claro→escuro
// no load. Mantido em sincronia com src/hooks/useTheme.ts.
// Arquivo separado (e não <script> inline no index.html) porque a CSP do
// vercel.json só libera script de 'self'.
(function () {
  try {
    var salvo = localStorage.getItem("hub-sac:tema");
    var escuro = salvo ? salvo === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (escuro) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
