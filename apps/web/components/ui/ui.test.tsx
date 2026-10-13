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
import { Skeleton } from './Skeleton';

afterEach(cleanup);

describe('Button', () => {
  it('primary: data-variant=primary + foco visible + type button + 44px target', () => {
    render(<Button>Guardar</Button>);
    const b = screen.getByRole('button', { name: 'Guardar' });
    expect(b).toHaveAttribute('data-variant', 'primary');
    expect(b).toHaveClass('focus-visible:ring-focus');
    expect(b).toHaveAttribute('type', 'button');
    // md size includes min-h-11
    expect(b).toHaveClass('min-h-11');
  });

  it('secondary + disabled', () => {
    render(<Button variant="secondary" disabled>X</Button>);
    const b = screen.getByRole('button', { name: 'X' });
    expect(b).toHaveAttribute('data-variant', 'secondary');
    expect(b).toHaveClass('border', 'bg-surface', 'disabled:opacity-50');
    expect(b).toBeDisabled();
  });

  it('pill: rounded-pill + aria-pressed según selected + data-selected', () => {
    render(<Button variant="pill" selected>Todos</Button>);
    const b = screen.getByRole('button', { name: 'Todos' });
    expect(b).toHaveClass('rounded-pill');
    expect(b).toHaveAttribute('data-variant', 'pill');
    expect(b).toHaveAttribute('data-selected', 'true');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    // selected pill uses bg-ink
    expect(b).toHaveClass('bg-ink');
  });

  it('pill not-selected: no bg-ink', () => {
    render(<Button variant="pill">Activos</Button>);
    const b = screen.getByRole('button', { name: 'Activos' });
    expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(b).toHaveAttribute('data-selected', 'false');
    expect(b).not.toHaveClass('bg-ink');
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
    expect(input).toBeInTheDocument();
    // Contenedor: anillo de foco y altura táctil mínima
    const wrapper = input.closest('div');
    expect(wrapper).toHaveClass('focus-within:ring-focus');
    expect(wrapper).toHaveClass('min-h-11');
  });

  it('getByLabelText funciona para asociar input al label', () => {
    render(<Field label="Correo electrónico" placeholder="email@ccb.do" />);
    const input = screen.getByLabelText('Correo electrónico');
    expect(input).toBeInTheDocument();
  });
});

describe('Chip', () => {
  it('aplica el tono y el dot con tokens semánticos (sin hex)', () => {
    render(<Chip tone="success" dot>Activo</Chip>);
    const chip = screen.getByText('Activo');
    expect(chip).toHaveClass('bg-success-bg', 'text-success-fg');
  });

  it('warning usa tokens warning sin hex fijo', () => {
    render(<Chip tone="warning">Pendiente</Chip>);
    const chip = screen.getByText('Pendiente');
    expect(chip).toHaveClass('bg-warning-bg', 'text-warning-fg');
    // Verify no hex color classes
    expect(chip.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('Card', () => {
  it('superficie estándar rounded-card y `as` semántico', () => {
    render(<Card as="article" aria-label="tarjeta">contenido</Card>);
    const card = screen.getByLabelText('tarjeta');
    expect(card.tagName).toBe('ARTICLE');
    expect(card).toHaveClass('rounded-card', 'border-line', 'bg-surface');
  });

  it('default NO es interactiva (sin hover/transition)', () => {
    render(<Card aria-label="estática">x</Card>);
    expect(screen.getByLabelText('estática')).not.toHaveClass('hover:shadow-md');
  });

  it('interactive → data-interactive + hover shadow + motion-safe lift', () => {
    render(<Card interactive aria-label="accionable">x</Card>);
    const card = screen.getByLabelText('accionable');
    expect(card).toHaveAttribute('data-interactive', 'true');
    expect(card).toHaveClass('hover:shadow-md', 'motion-safe:hover:-translate-y-0.5');
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

describe('Skeleton', () => {
  it('placeholder decorativo (aria-hidden) con barrido shimmer', () => {
    const { container } = render(<Skeleton className="h-9 w-20" />);
    const el = container.querySelector('span');
    expect(el).toHaveClass('app-shimmer', 'bg-surface-container', 'h-9', 'w-20');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });
});
