import { archetypes, archetypeId } from "./archetypes";
import { escape } from "./security";
import type { State } from "./store";
export function loginBrand(t: string, state: State) {
  const a = archetypes[archetypeId(t)],
    domain = state.config.accountDomains.employee;
  const name = domain.split(".")[0].toUpperCase();
  const marks: Record<string, string> = {
    realestate:
      '<path d="M7 33V14l13-7 13 7v19M15 33V23h10v10M12 16h2m12 0h2"/>',
    biotech:
      '<path d="M11 5c0 15 18 15 18 30M29 5c0 15-18 15-18 30M12 9h16M15 15h10M15 25h10M12 31h16"/>',
    insurance:
      '<path d="M20 5L6 11v10c0 8 14 15 14 15s14-7 14-15V11L20 5zM13 20l5 5 10-11"/>',
  };
  return {
    title: `${escape(name)} · ${escape(a.name)}`,
    header: `<div class="brand"><svg viewBox="0 0 40 40" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${marks[t]}</svg>${escape(name)}</div><p class="archetype">${escape(a.name)} · ${escape(a.motif)}</p>`,
    style: `body{background:${a.accent};color:${a.color}}button{background:${a.color}!important;color:white!important;border-radius:8px}.brand{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:700;letter-spacing:.08em}.archetype{color:${a.color}}`,
  };
}
