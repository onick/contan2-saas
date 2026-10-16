'use client';

import type { ReactNode } from 'react';
import { SearchX } from 'lucide-react';
import type { UserRow, UserStatus } from '../../lib/usuarios/demoData';
import { fecha } from '../../lib/format';
import { DataTableClient, type DataTableColumn, EmptyState, Chip, type ChipTone } from '../ui';
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
  'bg-info-soft text-info-text',
  'bg-[#fdeaf0] text-[#b03060]',
];

// Índice estable por código (el drawer no conoce el índice de fila).
export function avatarFor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

// Estado → tono de Chip (fallback para datos sin statusTone).
const STATUS_TONE: Record<UserStatus, ChipTone> = {
  activo: 'success',
  nuevo: 'warning',
  inactivo: 'neutral',
};

// Solo reformatea ISO (con zona fija DR). Los textos ya formateados en servidor
// ("hace 2 días", "13/10/2026", "Nunca") se muestran tal cual: re-parsearlos con
// new Date() usa la TZ del proceso y difería entre SSR (UTC) y cliente (#418).
const ISO_RE = /^\d{4}-\d{2}-\d{2}/;
function safeDate(s: string): string {
  if (!s || s === '—') return '—';
  return ISO_RE.test(s) && !isNaN(new Date(s).getTime()) ? fecha(s) : s;
}

export interface UsersTableProps {
  users: UserRow[];
  canWrite?: boolean;
}

export function UsersTable({ users, canWrite = false }: UsersTableProps) {
  const columns: DataTableColumn<UserRow>[] = [
    {
      id: 'persona',
      header: 'Persona',
      priority: 'always',
      width: '30%',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-[12px] font-semibold ${avatarFor(u.code)}`}>
            {initials(u.name)}
          </span>
          <div className="min-w-0">
            {/* whitespace-normal overrides the inherited white-space:nowrap from <td class="truncate"> */}
            <p className="min-w-0 whitespace-normal break-words text-[14px] font-semibold text-ink">{u.name}</p>
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="flex-1 min-w-0 truncate text-[12px] text-muted">{u.email}</p>
              <ProfileLink code={u.code} />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      priority: 'always',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.archived ? <Chip tone="neutral" dot>Archivado</Chip> : null}
          <Chip tone={(u.statusTone as ChipTone | undefined) ?? STATUS_TONE[u.status]} dot>
            {u.statusLabel}
          </Chip>
          {u.credentialLabel ? (
            <Chip tone={(u.credentialTone as ChipTone | undefined) ?? 'neutral'}>
              {u.credentialLabel}
            </Chip>
          ) : null}
        </div>
      ),
    },
    {
      id: 'visitas',
      header: 'Visitas',
      priority: 'md',
      cell: (u) => <span className="num text-[13px] text-muted">{u.visits ?? '—'}</span>,
    },
    {
      id: 'ultimo-acceso',
      header: 'Último acceso',
      priority: 'lg',
      cell: (u) => <span className="num text-[13px] text-muted">{safeDate(u.lastVisit) || '—'}</span>,
    },
    {
      id: 'alta',
      header: 'Alta',
      priority: 'md',
      cell: (u) => <span className="num text-[13px] text-muted">{safeDate(u.registeredAt)}</span>,
    },
    {
      id: 'acciones',
      header: '',
      priority: 'always',
      align: 'right',
      width: 56,
      cell: (u) => (
        <RowActions
          code={u.code}
          name={u.name}
          email={u.email === '—' ? null : u.email}
          archived={!!u.archived}
          canWrite={canWrite}
        />
      ),
    },
  ];

  // indices: persona=0, estado=1, visitas=2, ultimo-acceso=3, alta=4, acciones=5
  const mobileCard = (_u: UserRow, cells: ReactNode[]) => (
    <div className="flex flex-col px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">{cells[0]}</div>
        <div className="flex flex-none items-center">{cells[5]}</div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 pl-12">{cells[1]}</div>
    </div>
  );

  return (
    <DataTableClient
      data={users}
      columns={columns}
      getRowId={(u) => u.id}
      mobileCard={mobileCard}
      empty={
        <EmptyState
          icon={SearchX}
          title="Sin usuarios"
          description="No hay visitantes que coincidan con la búsqueda o los filtros."
        />
      }
    />
  );
}
