// ─────────────────────────────────────────────────────────
// timeSlots.ts  –  Definición de horas pico / valle
// Basado en patrones reales de retiro en OXXO / 7-Eleven MX
// ─────────────────────────────────────────────────────────

import { TimeSlot, TimeSlotType } from './types';

// Scores de demanda por hora (datos históricos simulados)
// Fuente: patrón típico de retiros en conveniencias CDMX
const DEMAND_BY_HOUR: Record<number, number> = {
  0:  10, 1:  5,  2:  5,  3:  5,  4:  5,  5:  8,
  6:  20, 7:  45, 8:  70, 9: 100, 10: 85, 11: 75,
  12: 80, 13: 60, 14: 55, 15: 50, 16: 40, 17: 45,
  18: 55, 19: 65, 20: 60, 21: 50, 22: 35, 23: 20,
};

// 9–11 AM: hora pico (todo el mundo quiere retiro al comenzar el día)
// 14–16 PM: "hora del camión de valores" — las tiendas quieren sacar efectivo
// 22–06: valle nocturno

function classifyHour(hour: number): TimeSlotType {
  if (hour >= 8 && hour <= 11) return 'peak';
  if (hour >= 22 || hour <= 5) return 'valley';
  if (hour >= 13 && hour <= 16) return 'valley'; // camión de valores
  return 'normal';
}

function labelForSlot(type: TimeSlotType, hour: number): string {
  if (type === 'peak')   return `hora pico (${hour}:00)`;
  if (type === 'valley') return hour >= 13 ? `hora de baja demanda (${hour}:00 — antes del camión de valores)` : `madrugada (${hour}:00)`;
  return `hora normal (${hour}:00)`;
}

export function getTimeSlot(hour: number): TimeSlot {
  const h = ((hour % 24) + 24) % 24;
  const type = classifyHour(h);
  return {
    hour: h,
    type,
    label: labelForSlot(type, h),
    demandScore: DEMAND_BY_HOUR[h] ?? 50,
  };
}

export function getCurrentSlot(): TimeSlot {
  // Hora CDMX (UTC-6)
  const now = new Date();
  const cdmxHour = (now.getUTCHours() - 6 + 24) % 24;
  return getTimeSlot(cdmxHour);
}

// Encuentra los próximos N slots de tipo dado en las siguientes `windowHours`
export function findNextSlotsOfType(
  type: TimeSlotType,
  windowHours = 12,
  count = 3
): TimeSlot[] {
  const now = new Date();
  const cdmxHour = (now.getUTCHours() - 6 + 24) % 24;
  const results: TimeSlot[] = [];

  for (let i = 1; i <= windowHours && results.length < count; i++) {
    const h = (cdmxHour + i) % 24;
    const slot = getTimeSlot(h);
    if (slot.type === type) results.push(slot);
  }

  return results;
}

// Devuelve la mejor ventana de valley en las próximas horas
export function getBestValleyWindow(): { start: Date; end: Date; slot: TimeSlot } {
  const valleySlots = findNextSlotsOfType('valley', 24, 1);
  const best = valleySlots[0] ?? getTimeSlot(15); // fallback: 3 PM

  const now = new Date();
  const cdmxHour = (now.getUTCHours() - 6 + 24) % 24;
  const hoursUntil = ((best.hour - cdmxHour) + 24) % 24 || 24;

  const start = new Date(now.getTime() + hoursUntil * 3600_000);
  const end   = new Date(start.getTime() + 2 * 3600_000); // ventana de 2h

  return { start, end, slot: best };
}
