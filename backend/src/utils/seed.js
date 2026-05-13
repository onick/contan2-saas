function futureDate(daysFromNow, hour = 19) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export async function seedDatabase(repos) {
  const existing = await repos.activities.count();
  if (existing > 0) {
    console.log(`[seed] omitido (ya hay ${existing} actividades)`);
    return;
  }
  const activities = [
    {
      name: 'Exposición de Arte Contemporáneo',
      type: 'exposicion',
      location: 'Sala Principal',
      date: futureDate(7, 18),
      capacity: 100,
      description:
        'Una muestra colectiva con los artistas más destacados de la escena contemporánea dominicana.',
    },
    {
      name: 'Concierto de Jazz Fusión',
      type: 'concierto',
      location: 'Auditorio',
      date: futureDate(14, 20),
      capacity: 200,
      description:
        'Una noche de jazz fusión con músicos de talla internacional acompañados por la Big Band del CCB.',
    },
    {
      name: 'Taller de Literatura Creativa',
      type: 'taller',
      location: 'Sala de Talleres',
      date: futureDate(3, 17),
      capacity: 30,
      description:
        'Aprende técnicas modernas de escritura creativa con autores reconocidos del país.',
    },
  ];

  for (const a of activities) {
    await repos.activities.create(a);
  }
  console.log(`[seed] ${activities.length} actividades creadas`);
}
