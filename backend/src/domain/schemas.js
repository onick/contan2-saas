const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s+\-()]{7,20}$/;
const CODE_RE = /^CCB-[A-Z0-9]{6}$/;

export const ACTIVITY_TYPES = [
  'exposicion',
  'concierto',
  'taller',
  'teatro',
  'conferencia',
  'otro',
];
export const ACTIVITY_STATUSES = ['activa', 'finalizada', 'cancelada'];

function isString(v) {
  return typeof v === 'string';
}

export function validateUserCreate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [{ field: '_', message: 'Body requerido' }];
  }
  const { firstName, lastName, email, phone } = data;

  if (!isString(firstName) || firstName.trim().length < 2 || firstName.trim().length > 50) {
    errors.push({ field: 'firstName', message: 'firstName requerido (2-50 caracteres)' });
  }
  if (!isString(lastName) || lastName.trim().length < 2 || lastName.trim().length > 50) {
    errors.push({ field: 'lastName', message: 'lastName requerido (2-50 caracteres)' });
  }
  if (email != null && email !== '') {
    if (!isString(email) || !EMAIL_RE.test(email.trim())) {
      errors.push({ field: 'email', message: 'email inválido' });
    }
  }
  if (phone != null && phone !== '') {
    if (!isString(phone) || !PHONE_RE.test(phone.trim())) {
      errors.push({ field: 'phone', message: 'phone inválido (7-20 caracteres permitidos)' });
    }
  }
  return errors;
}

export function validateUserUpdate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [{ field: '_', message: 'Body requerido' }];
  }
  if (data.firstName != null) {
    if (!isString(data.firstName) || data.firstName.trim().length < 2 || data.firstName.trim().length > 50) {
      errors.push({ field: 'firstName', message: 'firstName 2-50 caracteres' });
    }
  }
  if (data.lastName != null) {
    if (!isString(data.lastName) || data.lastName.trim().length < 2 || data.lastName.trim().length > 50) {
      errors.push({ field: 'lastName', message: 'lastName 2-50 caracteres' });
    }
  }
  if (data.email != null) {
    if (!isString(data.email) || !EMAIL_RE.test(data.email.trim())) {
      errors.push({ field: 'email', message: 'email inválido' });
    }
  }
  if (data.phone != null && data.phone !== '') {
    if (!isString(data.phone) || !PHONE_RE.test(data.phone.trim())) {
      errors.push({ field: 'phone', message: 'phone inválido' });
    }
  }
  return errors;
}

export function normalizeUserData(data) {
  const out = {};
  if (data.firstName != null) out.firstName = String(data.firstName).trim();
  if (data.lastName != null) out.lastName = String(data.lastName).trim();
  if (data.email != null) {
    const trimmed = String(data.email).trim().toLowerCase();
    out.email = trimmed === '' ? null : trimmed;
  }
  if (data.phone != null) {
    const trimmed = String(data.phone).trim();
    out.phone = trimmed === '' ? null : trimmed;
  }
  return out;
}

export function validateActivityCreate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [{ field: '_', message: 'Body requerido' }];
  }
  const { name, type, location, date, capacity, description, status } = data;

  if (!isString(name) || name.trim().length < 3 || name.trim().length > 100) {
    errors.push({ field: 'name', message: 'name requerido (3-100 caracteres)' });
  }
  if (!isString(type) || !ACTIVITY_TYPES.includes(type)) {
    errors.push({ field: 'type', message: `type requerido (${ACTIVITY_TYPES.join(', ')})` });
  }
  if (!isString(location) || location.trim().length < 2 || location.trim().length > 100) {
    errors.push({ field: 'location', message: 'location requerida (2-100 caracteres)' });
  }
  if (!date) {
    errors.push({ field: 'date', message: 'date requerida (ISO o YYYY-MM-DDTHH:mm)' });
  } else {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      errors.push({ field: 'date', message: 'date inválida' });
    } else if (d.getTime() < Date.now() - 60_000) {
      errors.push({ field: 'date', message: 'date debe ser presente o futura' });
    }
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
    errors.push({ field: 'capacity', message: 'capacity entero entre 1 y 10000' });
  }
  if (description != null && (!isString(description) || description.length > 1000)) {
    errors.push({ field: 'description', message: 'description string (máx 1000 caracteres)' });
  }
  if (status != null && !ACTIVITY_STATUSES.includes(status)) {
    errors.push({ field: 'status', message: `status inválido (${ACTIVITY_STATUSES.join(', ')})` });
  }
  if (data.imageUrl != null && data.imageUrl !== '') {
    if (!isString(data.imageUrl) || data.imageUrl.length > 500) {
      errors.push({ field: 'imageUrl', message: 'imageUrl inválida' });
    }
  }
  return errors;
}

export function validateActivityUpdate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [{ field: '_', message: 'Body requerido' }];
  }
  if (data.name != null && (!isString(data.name) || data.name.trim().length < 3 || data.name.trim().length > 100)) {
    errors.push({ field: 'name', message: 'name 3-100 caracteres' });
  }
  if (data.type != null && !ACTIVITY_TYPES.includes(data.type)) {
    errors.push({ field: 'type', message: 'type inválido' });
  }
  if (data.location != null && (!isString(data.location) || data.location.trim().length < 2 || data.location.trim().length > 100)) {
    errors.push({ field: 'location', message: 'location 2-100 caracteres' });
  }
  if (data.date != null) {
    const d = new Date(data.date);
    if (isNaN(d.getTime())) errors.push({ field: 'date', message: 'date inválida' });
  }
  if (data.capacity != null && (!Number.isInteger(data.capacity) || data.capacity < 1 || data.capacity > 10000)) {
    errors.push({ field: 'capacity', message: 'capacity entero entre 1 y 10000' });
  }
  if (data.description != null && (!isString(data.description) || data.description.length > 1000)) {
    errors.push({ field: 'description', message: 'description máx 1000 caracteres' });
  }
  if (data.status != null && !ACTIVITY_STATUSES.includes(data.status)) {
    errors.push({ field: 'status', message: 'status inválido' });
  }
  if (data.imageUrl != null && data.imageUrl !== '') {
    if (!isString(data.imageUrl) || data.imageUrl.length > 500) {
      errors.push({ field: 'imageUrl', message: 'imageUrl inválida' });
    }
  }
  return errors;
}

export function normalizeActivityData(data) {
  const out = {};
  if (data.name != null) out.name = String(data.name).trim();
  if (data.type != null) out.type = data.type;
  if (data.location != null) out.location = String(data.location).trim();
  if (data.date != null) out.date = new Date(data.date).toISOString();
  if (data.capacity != null) out.capacity = data.capacity;
  if (data.description != null) out.description = String(data.description).trim();
  if (data.status != null) out.status = data.status;
  if ('imageUrl' in data) {
    if (data.imageUrl == null) {
      out.imageUrl = null;
    } else {
      const trimmed = String(data.imageUrl).trim();
      out.imageUrl = trimmed === '' ? null : trimmed;
    }
  }
  return out;
}

export function validatePublicCheckin(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [{ field: '_', message: 'Body requerido' }];
  }
  if (!isString(data.activityId) || data.activityId.trim().length === 0) {
    errors.push({ field: 'activityId', message: 'activityId requerido' });
  }
  const hasCode = isString(data.userCode) && data.userCode.trim() !== '';
  const hasNewUser = data.newUser && typeof data.newUser === 'object';
  if (!hasCode && !hasNewUser) {
    errors.push({ field: '_', message: 'Se requiere userCode o newUser' });
  }
  if (hasCode && hasNewUser) {
    errors.push({ field: '_', message: 'Envía solo userCode o solo newUser, no ambos' });
  }
  if (hasCode && !/^CCB-[A-Z0-9]{6}$/.test(data.userCode.trim().toUpperCase())) {
    errors.push({ field: 'userCode', message: 'Formato inválido (CCB-XXXXXX)' });
  }
  if (hasNewUser) {
    const userErrors = validateUserCreate(data.newUser);
    for (const e of userErrors) {
      errors.push({ field: `newUser.${e.field}`, message: e.message });
    }
  }
  return errors;
}

export function validateAttendanceCreate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return [{ field: '_', message: 'Body requerido' }];
  }
  if (!isString(data.userCode) || !CODE_RE.test(data.userCode)) {
    errors.push({ field: 'userCode', message: 'userCode requerido (formato CCB-XXXXXX)' });
  }
  if (!isString(data.activityId) || data.activityId.trim().length === 0) {
    errors.push({ field: 'activityId', message: 'activityId requerido' });
  }
  return errors;
}
