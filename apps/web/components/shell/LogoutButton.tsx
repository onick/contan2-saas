import { LogOut } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';

// Logout del admin: form-post a /api/auth/logout (proxy → api-v2 revoca la
// sesión en DB y limpia la cookie, luego 303 → /login). Server Component, sin
// JS: funciona aunque el cliente no hidrate.
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/api/auth/logout" method="post" className={className}>
      <button
        type="submit"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className={cn(
          'inline-flex min-h-9 w-full items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-container hover:text-ink',
          // Modo riel (sidebar colapsado): sólo el icono, centrado, con tooltip.
          'group-data-[sidebar=collapsed]/shell:justify-center group-data-[sidebar=collapsed]/shell:px-0',
          focusRing,
        )}
      >
        <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="group-data-[sidebar=collapsed]/shell:hidden">Cerrar sesión</span>
      </button>
    </form>
  );
}
