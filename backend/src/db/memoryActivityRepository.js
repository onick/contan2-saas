import { randomUUID } from 'crypto';

export class MemoryActivityRepository {
  constructor() {
    this.activities = new Map();
  }

  async create(data) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const activity = {
      id,
      name: data.name,
      type: data.type,
      location: data.location,
      date: data.date,
      capacity: data.capacity,
      description: data.description ?? '',
      imageUrl: data.imageUrl ?? null,
      category: data.category ?? null,
      enrolledCount: 0,
      status: data.status ?? 'activa',
      createdAt: now,
      updatedAt: now,
    };
    this.activities.set(id, activity);
    return { ...activity };
  }

  async findAll(filters = {}) {
    let arr = Array.from(this.activities.values());
    if (filters.status) arr = arr.filter(a => a.status === filters.status);
    if (filters.type) arr = arr.filter(a => a.type === filters.type);
    if (filters.date) arr = arr.filter(a => a.date.slice(0, 10) === filters.date);
    arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    return arr.map(a => ({ ...a }));
  }

  async findById(id) {
    const a = this.activities.get(id);
    return a ? { ...a } : null;
  }

  async findByDateRange(from, to, { types, status, categories } = {}) {
    const fromT = new Date(from).getTime();
    const toT = new Date(to).getTime();
    const typeSet = Array.isArray(types) && types.length ? new Set(types) : null;
    const catSet = Array.isArray(categories) && categories.length
      ? new Set(categories.map(c => String(c).toLowerCase()))
      : null;
    const out = [];
    for (const a of this.activities.values()) {
      const t = new Date(a.date).getTime();
      if (isNaN(t) || t < fromT || t >= toT) continue;
      if (typeSet && !typeSet.has(a.type)) continue;
      if (status && a.status !== status) continue;
      if (catSet) {
        const cat = a.category ? String(a.category).toLowerCase() : null;
        if (!cat || !catSet.has(cat)) continue;
      }
      out.push({ ...a });
    }
    out.sort((a, b) => new Date(a.date) - new Date(b.date));
    return out;
  }

  async update(id, partial) {
    const a = this.activities.get(id);
    if (!a) return null;
    const updated = {
      ...a,
      ...partial,
      id: a.id,
      enrolledCount: a.enrolledCount,
      createdAt: a.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.activities.set(id, updated);
    return { ...updated };
  }

  async delete(id) {
    return this.activities.delete(id);
  }

  async incrementEnrolledIfRoom(id) {
    const a = this.activities.get(id);
    if (!a) return { ok: false, reason: 'not_found' };
    if (a.status !== 'activa') return { ok: false, reason: 'not_active' };
    if (a.enrolledCount >= a.capacity) return { ok: false, reason: 'full' };
    a.enrolledCount += 1;
    a.updatedAt = new Date().toISOString();
    return { ok: true, activity: { ...a } };
  }

  /**
   * Incremento "forzado": bypassa los checks de status='activa' y capacity.
   * Para registrar asistencia retroactiva. Solo bloquea si la actividad
   * está cancelada o no existe.
   */
  async incrementEnrolledForce(id) {
    const a = this.activities.get(id);
    if (!a) return { ok: false, reason: 'not_found' };
    if (a.status === 'cancelada') return { ok: false, reason: 'cancelled' };
    a.enrolledCount += 1;
    a.updatedAt = new Date().toISOString();
    return { ok: true, activity: { ...a } };
  }

  async decrementEnrolled(id) {
    const a = this.activities.get(id);
    if (!a) return null;
    if (a.enrolledCount > 0) a.enrolledCount -= 1;
    a.updatedAt = new Date().toISOString();
    return { ...a };
  }

  async count() {
    return this.activities.size;
  }

  async countByDate(dateStr, timeZone = 'UTC') {
    // dateStr es YYYY-MM-DD en la zona timeZone. Para cada activity
    // formatea su date en esa tz y compara.
    let n = 0;
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    for (const a of this.activities.values()) {
      const parts = Object.fromEntries(
        fmt.formatToParts(new Date(a.date)).map(p => [p.type, p.value]),
      );
      const localDate = `${parts.year}-${parts.month}-${parts.day}`;
      if (localDate === dateStr) n += 1;
    }
    return n;
  }

  async countByStatus(status) {
    let n = 0;
    for (const a of this.activities.values()) {
      if (a.status === status) n += 1;
    }
    return n;
  }

  async findTopByEnrolled(limit = 5) {
    return Array.from(this.activities.values())
      .sort((a, b) => b.enrolledCount - a.enrolledCount)
      .slice(0, limit)
      .map(a => ({ ...a }));
  }

  async finalizePastActivities(now = Date.now()) {
    const finalized = [];
    for (const a of this.activities.values()) {
      if (a.status === 'activa' && new Date(a.date).getTime() < now) {
        a.status = 'finalizada';
        a.updatedAt = new Date().toISOString();
        finalized.push({ ...a });
      }
    }
    return finalized;
  }

  dump() {
    return Array.from(this.activities.values()).map(a => ({ ...a }));
  }

  hydrate(arr) {
    this.activities.clear();
    for (const a of arr) {
      this.activities.set(a.id, { ...a });
    }
  }
}
