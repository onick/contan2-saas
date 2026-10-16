// ProofBar · prueba social como frase tipográfica. Las cifras salen de
// `proof.metrics` (cada una con source y asOf); nada se escribe a mano aquí.
import { Fragment } from 'react';
import type { LandingContent } from '../../../content/landing.types';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 2026-10-16 → "16 de octubre de 2026" (sin Intl: salida idéntica en cualquier ICU). */
export function formatAsOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS[(m ?? 1) - 1]} de ${y}`;
}

function Statement({ proof }: { proof: LandingContent['proof'] }) {
  const tpl = proof.statement ?? '{client}';
  const parts = tpl.split(/(\{client\}|\{m\d+\})/);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '{client}') return <strong key={i}>{proof.client.name}</strong>;
        const m = /^\{m(\d+)\}$/.exec(part);
        if (m) {
          const metric = proof.metrics[Number(m[1])];
          return (
            <span key={i} className="fig">
              {metric?.value}
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function ProofBar({ content }: { content: LandingContent['proof'] }) {
  const asOf = content.metrics[0]?.asOf;
  return (
    <section id="clientes" className="night proof" aria-labelledby="proof-title">
      <div className="container proof__grid">
        <div>
          <p className="client-slot">
            {content.client.name}
            {content.location ? ` · ${content.location}` : ''}
          </p>
          <h2 id="proof-title" className="proof__statement">
            <Statement proof={content} />
          </h2>
        </div>
        <div className="proof__meta">
          <p>
            {asOf ? `Datos al ${formatAsOf(asOf)}.` : null}
            {content.sourceNote ? ` Fuente: ${content.sourceNote}` : null}
          </p>
          {content.note ? <p>{content.note}</p> : null}
        </div>
      </div>
    </section>
  );
}
