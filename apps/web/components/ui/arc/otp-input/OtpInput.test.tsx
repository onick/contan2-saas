// OtpInput · un único <input> real + casillas visuales aria-hidden (jsdom).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { OtpInput, type OtpInputProps } from './OtpInput';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness(props: Partial<OtpInputProps> & { initial?: string }) {
  const [v, setV] = useState(props.initial ?? '');
  return <OtpInput label="PIN del centro" {...props} value={v} onChange={setV} />;
}

const input = () => screen.getByLabelText('PIN del centro') as HTMLInputElement;
const slots = (c: HTMLElement) => c.querySelectorAll('.arc-otp-slot');

describe('OtpInput', () => {
  it('es un solo input real con atributos de teclado numérico', () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(input()).toHaveAttribute('inputmode', 'numeric');
    expect(input()).toHaveAttribute('pattern', '[0-9]*');
    expect(input()).toHaveAttribute('maxlength', '8');
    expect(container.querySelector('.arc-otp-slots')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renderiza 4 casillas vacías y crece con el tipeo hasta el tope', () => {
    const { container } = render(<Harness />);
    expect(slots(container)).toHaveLength(4);
    fireEvent.change(input(), { target: { value: '1234' } });
    expect(slots(container)).toHaveLength(5);
    fireEvent.change(input(), { target: { value: '12345678' } });
    expect(slots(container)).toHaveLength(8);
  });

  it('sanitiza no-dígitos', () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '12ab' } });
    expect(input()).toHaveValue('12');
  });

  it('pegado: pega los dígitos limpiando espacios', () => {
    render(<Harness />);
    fireEvent.paste(input(), { clipboardData: { getData: () => '1234 5678' } });
    expect(input()).toHaveValue('12345678');
  });

  it('backspace (cambio a menos dígitos) borra el último', () => {
    render(<Harness initial="123" />);
    fireEvent.change(input(), { target: { value: '12' } });
    expect(input()).toHaveValue('12');
  });

  it('onComplete se llama al alcanzar completeLength, y no antes', () => {
    const onComplete = vi.fn();
    render(<Harness completeLength={4} onComplete={onComplete} />);
    fireEvent.change(input(), { target: { value: '123' } });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: '1234' } });
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('masked muestra • y revealLast descubre el último dígito un instante', () => {
    vi.useFakeTimers();
    const { container } = render(<Harness revealLast />);
    fireEvent.change(input(), { target: { value: '12' } });
    const text = () => Array.from(slots(container)).map((s) => s.textContent).join('');
    expect(text()).toBe('•2');
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(text()).toBe('••');
  });

  it('sin masked muestra los dígitos', () => {
    const { container } = render(<Harness masked={false} initial="42" />);
    expect(Array.from(slots(container)).map((s) => s.textContent).join('')).toBe('42');
  });

  it('error: aria-invalid, sacude y enfoca', () => {
    const { container, rerender } = render(<OtpInput label="PIN del centro" value="" onChange={() => {}} errorId="e" />);
    expect(input()).not.toHaveAttribute('aria-invalid');
    rerender(<OtpInput label="PIN del centro" value="" onChange={() => {}} errorId="e" error />);
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-describedby', 'e');
    expect(container.querySelector('.arc-otp')).toHaveAttribute('data-shake', 'true');
    expect(input()).toHaveFocus();
  });

  it('disabled deshabilita el input', () => {
    render(<Harness disabled />);
    expect(input()).toBeDisabled();
  });
});
