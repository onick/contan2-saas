import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent } from './Tabs';

afterEach(cleanup);

const tabs = [
  { value: 'one', label: 'Uno' },
  { value: 'two', label: 'Dos' },
  { value: 'three', label: 'Tres' },
];

describe('Tabs (Radix)', () => {
  it('renders all tab triggers', () => {
    render(
      <Tabs defaultValue="one" tabs={tabs}>
        <TabsContent value="one">Contenido Uno</TabsContent>
        <TabsContent value="two">Contenido Dos</TabsContent>
        <TabsContent value="three">Contenido Tres</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Uno' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tres' })).toBeInTheDocument();
  });

  it('active tab shows its content, inactive hidden', () => {
    render(
      <Tabs defaultValue="one" tabs={tabs}>
        <TabsContent value="one">Contenido Uno</TabsContent>
        <TabsContent value="two">Contenido Dos</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('Contenido Uno')).toBeInTheDocument();
  });

  it('clicking a tab switches content', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="one" tabs={tabs}>
        <TabsContent value="one">Contenido Uno</TabsContent>
        <TabsContent value="two">Contenido Dos</TabsContent>
      </Tabs>,
    );
    await user.click(screen.getByRole('tab', { name: 'Dos' }));
    expect(screen.getByText('Contenido Dos')).toBeInTheDocument();
  });

  it('active tab trigger has active state class', () => {
    render(
      <Tabs defaultValue="one" tabs={tabs}>
        <TabsContent value="one">x</TabsContent>
      </Tabs>,
    );
    const trigger = screen.getByRole('tab', { name: 'Uno' });
    // Radix sets data-state=active on the active trigger
    expect(trigger).toHaveAttribute('data-state', 'active');
  });
});
