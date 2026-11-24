// Menus e popovers desdobram em 3D a partir de onde foram chamados (rotateX -55° até 0,
// com mola), como na Central de Tickets.
export const ANIMACAO_MENU = {
  initial: { opacity: 0, rotateX: -55, z: -40, transformPerspective: 700 },
  animate: { opacity: 1, rotateX: 0, z: 0, transformPerspective: 700 },
  exit: { opacity: 0, rotateX: -30, z: -30, transformPerspective: 700, transition: { duration: 0.16 } },
  transition: { type: "spring", stiffness: 260, damping: 18, opacity: { duration: 0.15 } },
} as const;
