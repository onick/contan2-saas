import { randomUUID } from 'crypto';
import { generateUserCode } from '../utils/codeGenerator.js';

export class MemoryUserRepository {
  constructor() {
    this.users = new Map();
    this.byEmail = new Map();
    this.byCode = new Map();
    this.codePrefix = 'CCB';
  }

  async create(data) {
    const id = randomUUID();
    let code;
    let attempts = 0;
    do {
      code = generateUserCode(this.codePrefix);
      attempts++;
    } while (this.byCode.has(code) && attempts < 5);
    if (this.byCode.has(code)) {
      throw new Error('No se pudo generar un código único');
    }

    const now = new Date().toISOString();
    const user = {
      id,
      code,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      visitCount: 1,
      credentialSentAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    if (user.email) this.byEmail.set(user.email, id);
    this.byCode.set(user.code, id);
    return { ...user };
  }

  async findAll() {
    return Array.from(this.users.values()).map(u => ({ ...u }));
  }

  async findById(id) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async findByCode(code) {
    const id = this.byCode.get(code);
    return id ? { ...this.users.get(id) } : null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const id = this.byEmail.get(email);
    return id ? { ...this.users.get(id) } : null;
  }

  async findByEmailPrefix(prefix, limit = 3) {
    if (!prefix || prefix.length < 3) return { matches: [], total: 0 };
    const p = prefix.toLowerCase();
    const all = [];
    for (const u of this.users.values()) {
      if (u.email && u.email.toLowerCase().startsWith(p)) {
        all.push({ ...u });
      }
    }
    // Ordenar: más visitas primero, después más recientes
    all.sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return { matches: all.slice(0, limit), total: all.length };
  }

  async update(code, partial) {
    const id = this.byCode.get(code);
    if (!id) return null;
    const user = this.users.get(id);
    if ('email' in partial && partial.email !== user.email) {
      if (user.email) this.byEmail.delete(user.email);
      if (partial.email) this.byEmail.set(partial.email, id);
    }
    const updated = {
      ...user,
      ...partial,
      id: user.id,
      code: user.code,
      visitCount: user.visitCount,
      createdAt: user.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  async incrementVisit(code) {
    const id = this.byCode.get(code);
    if (!id) return null;
    const user = this.users.get(id);
    user.visitCount += 1;
    user.updatedAt = new Date().toISOString();
    return { ...user };
  }

  async markCredentialSent(code) {
    const id = this.byCode.get(code);
    if (!id) return null;
    const user = this.users.get(id);
    user.credentialSentAt = new Date().toISOString();
    user.updatedAt = user.credentialSentAt;
    return { ...user };
  }

  async delete(code) {
    const id = this.byCode.get(code);
    if (!id) return false;
    const user = this.users.get(id);
    this.users.delete(id);
    if (user.email) this.byEmail.delete(user.email);
    this.byCode.delete(user.code);
    return true;
  }

  async count() {
    return this.users.size;
  }

  dump() {
    return Array.from(this.users.values()).map(u => ({ ...u }));
  }

  hydrate(arr) {
    this.users.clear();
    this.byEmail.clear();
    this.byCode.clear();
    for (const u of arr) {
      const user = {
        id: u.id,
        code: u.code,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email ?? null,
        phone: u.phone ?? null,
        visitCount: u.visitCount ?? 0,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
      this.users.set(user.id, user);
      if (user.email) this.byEmail.set(user.email, user.id);
      this.byCode.set(user.code, user.id);
    }
  }
}
