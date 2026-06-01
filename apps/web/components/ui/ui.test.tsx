import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Bell, Inbox } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Field } from './Field';
import { Chip } from './Chip';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';
import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('Button', () => {
  it('primary: brand-strong + foco visible + type button + 44px', () => {
    render(<Button>Guardar</Button>);
    const b = screen.getByRole('button', { name: 'Guardar' });
    expect(b).toHaveClass('bg-brand-strong', 'min-h-11', 'focus-visible:ring-focus');
    expect(b).toHaveAttribute('type', 'button');
  });

  it('secondary + disabled', () => {
    render(<Button variant="secondary" disabled>X</Button>);
    const b = screen.getByRole('button', { name: 'X' });
    expect(b).toHaveClass('border', 'bg-surface', 'disabled:opacity-50');
    expect(b).toBeDisabled();
  });
});

describe('IconButton', () => {
  it('exige label accesible y es 44×44 con foco visible', () => {
    render(<IconButton label="Notificaciones"><Bell aria-hidden="true" /></IconButton>);
    const b = screen.getByRole('button', { name: 'Notificaciones' });
    expect(b).toHaveClass('h-11', 'w-11', 'focus-visible:ring-focus');
  });
});

describe('Field', () => {
  it('renderiza label + input con foco visible (uncontrolled)', () => {
    render(<Field label="Nombre visible" defaultValue="CCB" />);
    expect(screen.getByText('Nombre visible')).toBeInTheDocument();
    const input = screen.getByDisplayValue('CCB');
    expect(input).toHaveClass('focus-visible:ring-focus', 'min-h-11');
  });
});

describe('Chip', () => {
  it('aplica el tono y el dot', () => {
    render(<Chip tone="success" dot>Activo</Chip>);
    const chip = screen.getByText('Activo');
    expect(chip).toHaveClass('bg-success-bg', 'text-success-fg');
  });
});

describe('Card', () => {
  it('superficie estándar y `as` semántico', () => {
    render(<Card as="article" aria-label="tarjeta">contenido</Card>);
    const card = screen.getByLabelText('tarjeta');
    expect(card.tagName).toBe('ARTICLE');
    expect(card).toHaveClass('rounded-2xl', 'border-line', 'bg-surface');
  });
});

describe('SectionHeader', () => {
  it('level 1 → h1 + subtítulo + acciones', () => {
    render(
      <SectionHeader level={1} title="Usuarios" subtitle="Visitantes" actions={<Button>Nuevo</Button>} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('Visitantes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('título + descripción + ícono', () => {
    render(<EmptyState icon={Inbox} title="Sin registros" description="Todavía no hay asistencias." />);
    expect(screen.getByText('Sin registros')).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay asistencias.')).toBeInTheDocument();
  });
});
