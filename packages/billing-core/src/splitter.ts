import {
  daysInMonth,
  periodEndExclusive,
  periodStart,
  type DaySegment,
  type OccupancyInterval,
  type PeriodRef,
} from './model'

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y as number, (m as number) - 1, d as number)
}

function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
}

/**
 * Единый механизм пропорции дней (G-01…G-04): месяц режется на интервалы
 * постоянства всех параметров. Точки разреза — границы интервалов жильцов
 * и любые дополнительные границы (смена тарифа/норматива). Полуинтервалы [from, to).
 */
export function splitMonth(
  period: PeriodRef,
  occupancy: OccupancyInterval[],
  extraBoundaries: string[] = [],
): DaySegment[] {
  const start = periodStart(period)
  const end = periodEndExclusive(period)

  const cuts = new Set<string>([start, end])
  for (const interval of occupancy) {
    if (interval.dateFrom > start && interval.dateFrom < end) cuts.add(interval.dateFrom)
    if (interval.dateTo !== null && interval.dateTo > start && interval.dateTo < end) cuts.add(interval.dateTo)
  }
  for (const boundary of extraBoundaries) {
    if (boundary > start && boundary < end) cuts.add(boundary)
  }

  const points = [...cuts].sort()
  const segments: DaySegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dateFrom = points[i] as string
    const dateTo = points[i + 1] as string
    const active = occupancy.find(
      (o) => o.dateFrom <= dateFrom && (o.dateTo === null || o.dateTo > dateFrom),
    )
    segments.push({ dateFrom, dateTo, days: diffDays(dateFrom, dateTo), occupancy: active?.count ?? 0 })
  }
  return segments
}

export function monthDays(period: PeriodRef): number {
  return daysInMonth(period)
}
