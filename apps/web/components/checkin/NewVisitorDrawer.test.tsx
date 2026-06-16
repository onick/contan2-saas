// components/checkin/NewVisitorDrawer.test.tsx · al abrir, pre-rellena Nombre/
// Apellido desde el texto del buscador (initialName): 1ª palabra = nombre, resto
// = apellido. Sin texto → vacío.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NewVisitorDrawer } from './NewVisitorDrawer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const noop = () => {};
const inputs = () => screen.getAllByRole('textbox') as HTMLInputElement[];

describe('NewVisitorDrawer · prefill desde el buscador', () => {
  it('"Esmeralda Ramirez" → Nombre=Esmeralda, Apellido=Ramirez', () => {
    render(<NewVisitorDrawer open activities={[]} onClose={noop} onDone={noop} initialName="Esmeralda Ramirez" />);
    expect(inputs()[0]!.value).toBe('Esmeralda');
    expect(inputs()[1]!.value).toBe('Ramirez');
  });

  it('nombre compuesto: "Maria Mercedes Ortiz" → Nombre=Maria, Apellido="Mercedes Ortiz"', () => {
    render(<NewVisitorDrawer open activities={[]} onClose={noop} onDone={noop} initialName="  Maria Mercedes Ortiz  " />);
    expect(inputs()[0]!.value).toBe('Maria');
    expect(inputs()[1]!.value).toBe('Mercedes Ortiz');
  });

  it('una sola palabra → Nombre, Apellido vacío', () => {
    render(<NewVisitorDrawer open activities={[]} onClose={noop} onDone={noop} initialName="Madonna" />);
    expect(inputs()[0]!.value).toBe('Madonna');
    expect(inputs()[1]!.value).toBe('');
  });

  it('sin texto en el buscador → ambos vacíos', () => {
    render(<NewVisitorDrawer open activities={[]} onClose={noop} onDone={noop} />);
    expect(inputs()[0]!.value).toBe('');
    expect(inputs()[1]!.value).toBe('');
  });
});
