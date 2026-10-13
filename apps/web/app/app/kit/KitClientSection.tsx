'use client';

import { useState } from 'react';
import { Settings, Trash2, Copy, ChevronDown } from 'lucide-react';
import { Button, Tabs, TabsContent, Sheet, ConfirmDialog, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Tooltip, SegmentedControlClient } from '@/components/ui';

export function KitClientSection() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [seg, setSeg] = useState('todos');

  return (
    <div className="space-y-12">
      {/* Tabs */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Tabs (Radix)</h2>
        <Tabs
          defaultValue="tab1"
          tabs={[
            { value: 'tab1', label: 'General' },
            { value: 'tab2', label: 'Actividad' },
            { value: 'tab3', label: 'Configuración' },
          ]}
        >
          <TabsContent value="tab1"><p className="text-[14px] text-muted">Contenido de General</p></TabsContent>
          <TabsContent value="tab2"><p className="text-[14px] text-muted">Contenido de Actividad</p></TabsContent>
          <TabsContent value="tab3"><p className="text-[14px] text-muted">Contenido de Configuración</p></TabsContent>
        </Tabs>
      </section>

      {/* SegmentedControl */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">SegmentedControl</h2>
        <SegmentedControlClient
          items={[
            { value: 'todos', label: 'Todos' },
            { value: 'activos', label: 'Activos' },
            { value: 'cerrados', label: 'Cerrados' },
          ]}
          value={seg}
          onChange={setSeg}
        />
      </section>

      {/* Dialogs */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Sheet & ConfirmDialog</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>Abrir Sheet</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Confirmar acción</Button>
        </div>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Panel lateral"
          description="Información adicional"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSheetOpen(false)}>Cancelar</Button>
              <Button onClick={() => setSheetOpen(false)}>Guardar</Button>
            </>
          }
        >
          <p className="text-[14px] text-muted">Contenido del panel. En móvil entra desde abajo, en tablet/desktop desde la derecha.</p>
        </Sheet>
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {}}
          title="¿Confirmar eliminación?"
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          destructive
        />
      </section>

      {/* Dropdown & Tooltip */}
      <section className="space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Dropdown & Tooltip</h2>
        <div className="flex flex-wrap gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" iconRight={ChevronDown}>Opciones</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={Settings}>Configurar</DropdownMenuItem>
              <DropdownMenuItem icon={Copy}>Duplicar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Trash2} destructive>Eliminar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip content="Información de ayuda">
            <Button variant="ghost">Hover para tooltip</Button>
          </Tooltip>
        </div>
      </section>
    </div>
  );
}
