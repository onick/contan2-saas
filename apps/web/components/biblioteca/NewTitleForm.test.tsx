import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NewTitleForm } from './NewTitleForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

afterEach(cleanup);

const base = { staffName: null, subjectSuggestions: [], sitesCount: 1 };

describe('NewTitleForm · foco inicial según ?modo', () => {
  it('por defecto (isbn) enfoca el campo ISBN', () => {
    render(<NewTitleForm {...base} />);
    expect(screen.getByLabelText('ISBN')).toHaveFocus();
  });

  it('initialFocus="title" (modo manual) enfoca el Título', () => {
    render(<NewTitleForm {...base} initialFocus="title" />);
    expect(screen.getByRole('textbox', { name: /^Título/ })).toHaveFocus();
  });
});
