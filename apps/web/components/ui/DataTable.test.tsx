import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DataTable, type DataTableColumn } from './DataTable';
import { DataTableClient } from './DataTableClient';

afterEach(cleanup);

interface Person {
  id: string;
  name: string;
  role: string;
}

const data: Person[] = [
  { id: '1', name: 'Ana García', role: 'Admin' },
  { id: '2', name: 'Luis Pérez', role: 'Staff' },
];

const columns: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Nombre', cell: (r) => r.name, priority: 'always' },
  { id: 'role', header: 'Rol', cell: (r) => r.role, priority: 'md' },
];

// — DataTable (servidor, sin callbacks) —

describe('DataTable', () => {
  it('renderiza filas desde data', () => {
    render(<DataTable data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Luis Pérez').length).toBeGreaterThan(0);
  });

  it('loading muestra skeleton rows', () => {
    render(<DataTable data={[]} columns={columns} getRowId={(r) => r.id} loading />);
    const skeletons = document.querySelectorAll('.app-shimmer');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('empty renderiza nodo personalizado', () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        getRowId={(r) => r.id}
        empty={<span>Sin datos</span>}
      />,
    );
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThan(0);
  });

  it('paginación con href muestra rango formateado', () => {
    render(
      <DataTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        pagination={{ page: 1, pageSize: 6, total: 1333, hrefPrev: '/?p=0', hrefNext: '/?p=2' }}
      />,
    );
    expect(screen.getAllByText(/Mostrando/).length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/1[.,\s]333/);
  });

  it('columnas md tienen clase hidden en su th', () => {
    const { container } = render(
      <DataTable data={data} columns={columns} getRowId={(r) => r.id} />,
    );
    const ths = container.querySelectorAll('th');
    const rolTh = Array.from(ths).find((th) => th.textContent === 'Rol');
    expect(rolTh).toBeTruthy();
    expect(rolTh!.className).toContain('hidden');
  });

  it('col.cell(row) se invoca una vez por celda (no dos veces)', () => {
    const cellSpy = vi.fn((r: Person) => r.name);
    const spyCols: DataTableColumn<Person>[] = [
      { id: 'name', header: 'Nombre', cell: cellSpy, priority: 'always' },
    ];
    render(<DataTable data={[data[0]!]} columns={spyCols} getRowId={(r) => r.id} />);
    // desktop + mobile → la función se llama una vez por vista pero gracias a
    // rowsWithCells el resultado se reutiliza: debe ser exactamente 1 call.
    expect(cellSpy).toHaveBeenCalledTimes(1);
  });
});

// — DataTableClient (cliente, con callbacks) —

describe('DataTableClient', () => {
  it('renderiza filas desde data', () => {
    render(<DataTableClient data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
  });

  it('onRowClick se dispara al hacer clic en una fila', () => {
    const onClick = vi.fn();
    render(
      <DataTableClient
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={onClick}
      />,
    );
    const rows = document.querySelectorAll('tr[tabindex="0"]');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]!);
    expect(onClick).toHaveBeenCalledWith(data[0]);
  });

  it('Enter en una fila dispara onRowClick', () => {
    const onClick = vi.fn();
    render(
      <DataTableClient
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={onClick}
      />,
    );
    const rows = document.querySelectorAll('tr[tabindex="0"]');
    fireEvent.keyDown(rows[0]!, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(data[0]);
  });

  it('Espacio en una fila dispara onRowClick', () => {
    const onClick = vi.fn();
    render(
      <DataTableClient
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={onClick}
      />,
    );
    const rows = document.querySelectorAll('tr[tabindex="0"]');
    fireEvent.keyDown(rows[0]!, { key: ' ' });
    expect(onClick).toHaveBeenCalledWith(data[0]);
  });

  it('sin onRowClick las filas no tienen tabIndex', () => {
    render(<DataTableClient data={data} columns={columns} getRowId={(r) => r.id} />);
    const rows = document.querySelectorAll('tr[tabindex="0"]');
    expect(rows.length).toBe(0);
  });

  it('paginación con callbacks muestra rango formateado', () => {
    render(
      <DataTableClient
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        pagination={{ page: 1, pageSize: 6, total: 1333, onPrev: vi.fn(), onNext: vi.fn() }}
      />,
    );
    expect(screen.getAllByText(/Mostrando/).length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/1[.,\s]333/);
  });
});
