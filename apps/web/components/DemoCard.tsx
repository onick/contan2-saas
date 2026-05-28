export interface DemoCardProps {
  title: string;
  body: string;
}

// Card de demostración. Tipografía y padding escalan por breakpoint.
export function DemoCard({ title, body }: DemoCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-semibold text-slate-900 md:text-xl">{title}</h2>
      <p className="mt-2 text-sm text-slate-600 md:text-base">{body}</p>
    </article>
  );
}
