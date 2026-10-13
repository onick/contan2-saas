import { notFound } from 'next/navigation';
import { Bell, Search, Users, Activity, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import {
  Button, Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  StatCard, Field, Input, Avatar, Kbd, Toolbar, TabsNav,
  EmptyState, Skeleton, IconButton, SectionHeader,
} from '@/components/ui';
import { KitClientSection } from './KitClientSection';

export default function KitPage() {
  if (process.env.NEXT_PUBLIC_KIT_ENABLED !== '1') {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-10">
      <SectionHeader level={1} title="Kit de UI" subtitle="Todos los componentes del sistema de diseño" />

      {/* Buttons */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Buttons</h2>
        <Toolbar>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button variant="secondary" size="sm">Small</Button>
          <Button variant="secondary" size="lg">Large</Button>
          <Button loading>Loading</Button>
          <Button icon={Bell}>Con ícono</Button>
        </Toolbar>
        <Toolbar>
          <Button variant="pill" selected>Todos</Button>
          <Button variant="pill">Activos</Button>
          <Button variant="pill">Cerrados</Button>
        </Toolbar>
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="success">Éxito</Badge>
          <Badge tone="danger">Error</Badge>
          <Badge tone="warning">Advertencia</Badge>
          <Badge tone="info">Información</Badge>
          <Badge tone="brand">Marca</Badge>
        </div>
      </section>

      {/* Cards */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Cards</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Título de la tarjeta</CardTitle>
              <CardDescription>Descripción breve del contenido</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[14px] text-muted">Contenido de la tarjeta con información relevante.</p>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="sm">Cancelar</Button>
              <Button size="sm">Guardar</Button>
            </CardFooter>
          </Card>
          <Card interactive>
            <CardContent>
              <p className="text-[14px] text-ink">Tarjeta interactiva (hover lift)</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* StatCards */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">StatCards</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={Users} label="Visitantes este mes" value="1,234" trend={{ value: '+12%', dir: 'up', hint: 'vs mes anterior' }} />
          <StatCard icon={Activity} label="Actividades activas" value="28" trend={{ value: '-3', dir: 'down', hint: 'vs mes anterior' }} />
          <StatCard label="Promedio diario" value="41.2" trend={{ value: '=', dir: 'flat' }} />
          <StatCard icon={Bell} label="Alertas pendientes" value="0" />
        </div>
      </section>

      {/* Inputs */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Inputs</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nombre completo" placeholder="Ej. Juan Pérez" />
          <Field label="Búsqueda" leadingIcon={Search} placeholder="Buscar..." />
          <Field label="Contraseña" type="password" placeholder="••••••••" />
          <Input leadingIcon={Search} placeholder="Input directo" />
        </div>
      </section>

      {/* Avatars & Kbd */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Avatar & Kbd</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Ana García" />
          <Avatar name="B" />
          <Avatar name="Carlos Rodríguez" />
          <Kbd>⌘K</Kbd>
          <Kbd>Escape</Kbd>
          <Kbd>⇧⌘P</Kbd>
        </div>
      </section>

      {/* TabsNav */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">TabsNav (servidor)</h2>
        <TabsNav
          items={[
            { label: 'Visión general', href: '#', active: true },
            { label: 'Actividades', href: '#' },
            { label: 'Visitantes', href: '#' },
            { label: 'Reportes', href: '#' },
          ]}
        />
      </section>

      {/* EmptyState & Skeleton */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Empty & Skeleton</h2>
        <EmptyState icon={Users} title="Sin visitantes" description="Todavía no hay registros para este período." action={<Button>Registrar visitante</Button>} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-9 w-1/2" />
        </div>
      </section>

      {/* Client-side components */}
      <KitClientSection />
    </div>
  );
}
