import { randomUUID } from 'crypto';

export class MemoryAttendanceRepository {
  constructor() {
    this.attendances = new Map();
  }

  async create(data) {
    const id = randomUUID();
    const att = {
      id,
      userId: data.userId,
      userCode: data.userCode,
      activityId: data.activityId,
      activityName: data.activityName,
      registeredAt: new Date().toISOString(),
    };
    this.attendances.set(id, att);
    return { ...att };
  }

  async findAll(filters = {}) {
    let arr = Array.from(this.attendances.values());
    if (filters.userCode) arr = arr.filter(a => a.userCode === filters.userCode);
    if (filters.activityId) arr = arr.filter(a => a.activityId === filters.activityId);
    if (filters.userId) arr = arr.filter(a => a.userId === filters.userId);
    arr.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));
    return arr.map(a => ({ ...a }));
  }

  async findByUserId(userId) {
    return Array.from(this.attendances.values())
      .filter(a => a.userId === userId)
      .map(a => ({ ...a }));
  }

  async findByActivityId(activityId) {
    return Array.from(this.attendances.values())
      .filter(a => a.activityId === activityId)
      .map(a => ({ ...a }));
  }

  async findOne({ userId, activityId }) {
    for (const a of this.attendances.values()) {
      if (a.userId === userId && a.activityId === activityId) return { ...a };
    }
    return null;
  }

  async delete(id) {
    const a = this.attendances.get(id);
    if (!a) return null;
    this.attendances.delete(id);
    return { ...a };
  }

  async count() {
    return this.attendances.size;
  }

  dump() {
    return Array.from(this.attendances.values()).map(a => ({ ...a }));
  }

  hydrate(arr) {
    this.attendances.clear();
    for (const a of arr) {
      this.attendances.set(a.id, { ...a });
    }
  }
}
