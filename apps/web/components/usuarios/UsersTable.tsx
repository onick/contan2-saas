import { ChevronDown, SearchX } from 'lucide-react';
import type { UserRow, UserStatus } from '../../lib/usuarios/demoData';
import { Card, Chip, EmptyState, type ChipTone } from '../ui';
import { ProfileLink } from './ProfileProvider';
import { RowActions } from './RowActions';

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Paleta de avatares (tintes suaves) por índice → da vida sin romper coherencia.
// Exportada: el drawer de perfil usa el MISMO avatar (índice estable por código).
export const AVATAR_COLORS = [
  'bg-[#ffe6d2] text-[#7a3300]',
  'bg-[#e3f4f1] text-[#0f7a6b]',
  'bg-[#efe9fb] text-[#6b3fb8]',
  'bg-[#e8f0fe] text-[#1a56b0]',
  'bg-[#fdeaf0] text-[#b03060]',
];

// Índice estable por código (el drawer no conoce el índice de fila).
export function avatarFor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

// Estado → tono de Chip (fallback para demo; los datos reales traen statusTone).
const STATUS_TONE: Record<UserStatus, ChipTone> = {
  activo: 'success',
  nuevo: 'warning',
  inactivo: 'neutral',
};

export interface UsersTableProps {
  users: UserRow[];
  canWrite?: boolean; // owner/admin → habilita acciones de escritura por fila
}

// Tabla de usuarios · estilo Google/Material: avatar con iniciales (color por
// índice), código, visitas, última visita y chip de estado con punto. En mobile
// se ocultan Código y Última visita. Server Component. Datos demo (no PII).
export function UsersTable({ users, canWrite = false }: UsersTableProps) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Sin usuarios"
        description="No hay visitantes que coincidan con la búsqueda o los filtros."
      />
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <th className="px-5 py-3 md:px-6">Usuario</th>
              <th className="hidden px-4 py-3 xl:table-cell">Código</th>
              <th className="hidden px-4 py-3 lg:table-cell">
                <span className="inline-flex items-center gap-1">
                  Registro <ChevronDown size={13} strokeWidth={2} aria-hidden="true" className="text-brand" />
                </span>
              </th>
              <th className="px-4 py-3">Visitas</th>
              <th className="hidden px-4 py-3 md:table-cell">Última visita</th>
              <th className="hidden px-4 py-3 lg:table-cell">Credencial</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="app-stagger">
            {users.map((u, i) => {
              const avatar = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <tr key={u.id} data-user-row={u.code} className="cursor-pointer border-t border-line align-middle hover:bg-page">
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-[12px] font-semibold ${avatar}`}>
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight text-ink">{u.name}</p>
                        <p className="truncate text-xs text-faint">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] tabular-nums text-muted xl:table-cell">{u.code}</td>
                  <td className="hidden whitespace-nowrap px-4 py-4 lg:table-cell">
                    <span className="block text-[13px] text-ink">{u.registeredAt}</span>
                    <span className="block text-xs text-faint">{u.registeredAgo}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex min-w-[28px] justify-center rounded-full bg-surface-container px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                      {u.visits}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] text-muted md:table-cell">{u.lastVisit}</td>
                  <td className="hidden px-4 py-4 lg:table-cell">
                    {u.credentialLabel ? (
                      <Chip tone={(u.credentialTone ?? 'neutral') as ChipTone} dot>{u.credentialLabel}</Chip>
                    ) : (
                      <span className="text-[13px] text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.archived ? <Chip tone="neutral" dot>Archivado</Chip> : null}
                      {u.statusLabel ? (
                        <Chip tone={(u.statusTone as ChipTone | undefined) ?? STATUS_TONE[u.status]} dot>{u.statusLabel}</Chip>
                      ) : !u.archived ? (
                        <span className="text-[13px] text-faint" title="Última visita hace 31–90 días">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <ProfileLink code={u.code} />
                      <RowActions code={u.code} email={u.email === '—' ? null : u.email} archived={!!u.archived} canWrite={canWrite} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
