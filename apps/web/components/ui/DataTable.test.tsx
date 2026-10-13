import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DataTable, type DataTableColumn } from './DataTable';

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

describe('DataTable', () => {
  it('renders rows from data', () => {
    render(<DataTable data={data} columns={columns} getRowId={(r) => r.id} />);
    expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Luis Pérez').length).toBeGreaterThan(0);
  });

  it('loading state shows skeleton rows (no data)', () => {
    render(<DataTable data={[]} columns={columns} getRowId={(r) => r.id} loading />);
    // skeleton spans are present
    const skeletons = document.querySelectorAll('.app-shimmer');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('empty state renders custom empty node', () => {
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

  it('pagination bar shows formatted range text', () => {
    render(
      <DataTable
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        pagination={{ page: 1, pageSize: 6, total: 1333 }}
      />,
    );
    // "Mostrando 1–6 de 1.333" (es-DO) or similar locale format
    expect(screen.getAllByText(/Mostrando/).length).toBeGreaterThan(0);
    // Total formatted with thousands separator (., , or space depending on locale support)
    expect(document.body.textContent).toMatch(/1[.,\s]333/);
  });

  it('priority md columns have hidden class on mobile', () => {
    const { container } = render(
      <DataTable data={data} columns={columns} getRowId={(r) => r.id} />,
    );
    // The "Rol" header cell in the desktop table should have hidden md:table-cell
    const ths = container.querySelectorAll('th');
    const rolTh = Array.from(ths).find((th) => th.textContent === 'Rol');
    expect(rolTh).toBeTruthy();
    expect(rolTh!.className).toContain('hidden');
  });
});
