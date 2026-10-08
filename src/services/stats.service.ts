import { QueryTypes } from 'sequelize';
import { READABLE_ROLES, type Role } from '../constants/roles';
import { sequelize } from '../models';
import type { AuthUser } from '../types/express';

/** Days are counted in Manokwari time (WIT), where the UMKM and their admins are. */
export const STATS_TIMEZONE = 'Asia/Jayapura';

const query = <T extends object>(sql: string, replacements: Record<string, unknown>) =>
  sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });

/**
 * The same status rule as the frontend (lib/format.ts → productStatus): active; waiting (no decision yet, or edited
 * after the last decision); rejected ("Ditolak: …"); otherwise deactivated.
 */
const PRODUCT_STATUS_SQL = `
  CASE
    WHEN a.id IS NULL THEN 'pending'
    WHEN a.is_active THEN 'active'
    WHEN a.reason IS NULL OR a.reason = 'Waiting for approval' THEN 'pending'
    WHEN p.updated_at > a.updated_at + interval '1 second' THEN 'pending'
    WHEN a.reason LIKE 'Ditolak: %' THEN 'rejected'
    ELSE 'inactive'
  END`;

/** Every day of the period (in WIT), so days without activity are 0 instead of missing. */
const DAYS_SQL = `
  SELECT to_char(d, 'YYYY-MM-DD') AS date
  FROM generate_series(
    (now() AT TIME ZONE :tz)::date - (:days - 1),
    (now() AT TIME ZONE :tz)::date,
    interval '1 day'
  ) AS d`;

const perDay = (table: string, where = 'TRUE') => `
  SELECT days.date, COALESCE(c.count, 0)::int AS count
  FROM (${DAYS_SQL}) days
  LEFT JOIN (
    SELECT to_char((created_at AT TIME ZONE :tz)::date, 'YYYY-MM-DD') AS date, COUNT(*) AS count
    FROM ${table}
    WHERE ${where} AND created_at >= ((now() AT TIME ZONE :tz)::date - (:days - 1)) AT TIME ZONE :tz
    GROUP BY 1
  ) c ON c.date = days.date
  ORDER BY days.date`;

type DayCount = { date: string; count: number };

/**
 * Dashboard numbers for superadmin, disnakertrans and admin. Products and UMKM: all of them (these roles read them
 * all). Users: only the roles the caller may list (READABLE_ROLES: superadmin all, disnakertrans admins, admin
 * tenants). `days`: the length of the "new per day" series.
 */
export async function overview(user: AuthUser, days: number) {
  const roles: Role[] = READABLE_ROLES[user.role];
  const r = { tz: STATS_TIMEZONE, days, roles: roles.length ? roles : [''] };

  const [statusRows, productDays, tenantTotal, categoryRows, areaRows, tenantDays, roleRows, userDays] = await Promise.all([
    query<{ status: string; count: number }>(
      `SELECT ${PRODUCT_STATUS_SQL} AS status, COUNT(*)::int AS count
       FROM products p LEFT JOIN approvals a ON a.id = p.approval_id GROUP BY 1`,
      r,
    ),
    query<DayCount>(perDay('products'), r),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM tenants`, r),
    query<{ name: string; count: number }>(
      `SELECT c.name, COUNT(t.id)::int AS count
       FROM tenant_categories c LEFT JOIN tenants t ON t.tenant_category_id = c.id
       GROUP BY c.id, c.name ORDER BY count DESC, c.name`,
      r,
    ),
    query<{ area: string; count: number }>(
      `SELECT area, COUNT(*)::int AS count FROM tenants GROUP BY area ORDER BY count DESC, area LIMIT 10`,
      r,
    ),
    query<DayCount>(perDay('tenants'), r),
    query<{ role: Role; active: number; inactive: number }>(
      `SELECT u.role,
              COUNT(*) FILTER (WHERE a.is_active)::int AS active,
              COUNT(*) FILTER (WHERE a.is_active IS NOT TRUE)::int AS inactive
       FROM users u LEFT JOIN approvals a ON a.user_id = u.id AND a.type = 'user'
       WHERE u.role IN (:roles)
       GROUP BY u.role`,
      r,
    ),
    query<DayCount>(perDay('users', 'role IN (:roles)'), r),
  ]);

  const byStatus = { active: 0, pending: 0, rejected: 0, inactive: 0 };
  for (const row of statusRows) byStatus[row.status as keyof typeof byStatus] = row.count;
  const byRole = roles.map((role) => {
    const row = roleRows.find((x) => x.role === role);
    return { role, active: row?.active ?? 0, inactive: row?.inactive ?? 0 };
  });

  return {
    days,
    timezone: STATS_TIMEZONE,
    products: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
    tenants: { total: tenantTotal[0]?.count ?? 0, byCategory: categoryRows, byArea: areaRows },
    users: { roles, total: byRole.reduce((a, x) => a + x.active + x.inactive, 0), byRole },
    // New products, UMKM profiles and accounts (readable roles) per day
    perDay: productDays.map((d, i) => ({
      date: d.date,
      products: d.count,
      tenants: tenantDays[i]?.count ?? 0,
      users: userDays[i]?.count ?? 0,
    })),
  };
}

/** API log numbers for the superadmin: per day (successful / failed), by method, busiest endpoints, top errors. */
export async function logs(days: number) {
  const r = { tz: STATS_TIMEZONE, days };
  const since = `created_at >= ((now() AT TIME ZONE :tz)::date - (:days - 1)) AT TIME ZONE :tz`;
  const [dayRows, methodRows, pathRows, errorRows, roleRows] = await Promise.all([
    query<{ date: string; success: number; failed: number }>(
      `SELECT days.date, COALESCE(c.success, 0)::int AS success, COALESCE(c.failed, 0)::int AS failed
       FROM (${DAYS_SQL}) days
       LEFT JOIN (
         SELECT to_char((created_at AT TIME ZONE :tz)::date, 'YYYY-MM-DD') AS date,
                COUNT(*) FILTER (WHERE status_code < 400) AS success,
                COUNT(*) FILTER (WHERE status_code >= 400) AS failed
         FROM api_logs WHERE ${since} GROUP BY 1
       ) c ON c.date = days.date
       ORDER BY days.date`,
      r,
    ),
    query<{ method: string; count: number }>(
      `SELECT method, COUNT(*)::int AS count FROM api_logs WHERE ${since} GROUP BY method ORDER BY count DESC`,
      r,
    ),
    // ids in paths are grouped, so /api/products/<uuid> counts as one endpoint
    query<{ endpoint: string; count: number; failed: number }>(
      `SELECT method || ' ' || regexp_replace(regexp_replace(path, '[0-9a-f]{8}-[0-9a-f-]{27}', ':id', 'gi'), '/[0-9]+(/|$)', '/:id\\1', 'g') AS endpoint,
              COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status_code >= 400)::int AS failed
       FROM api_logs WHERE ${since} GROUP BY 1 ORDER BY count DESC LIMIT 8`,
      r,
    ),
    query<{ errorCode: string; count: number }>(
      `SELECT error_code AS "errorCode", COUNT(*)::int AS count
       FROM api_logs WHERE ${since} AND error_code IS NOT NULL GROUP BY 1 ORDER BY count DESC LIMIT 8`,
      r,
    ),
    query<{ role: string; count: number }>(
      `SELECT COALESCE(user_role, 'guest') AS role, COUNT(*)::int AS count FROM api_logs WHERE ${since} GROUP BY 1 ORDER BY count DESC`,
      r,
    ),
  ]);
  const success = dayRows.reduce((a, d) => a + d.success, 0);
  const failed = dayRows.reduce((a, d) => a + d.failed, 0);
  return {
    days,
    timezone: STATS_TIMEZONE,
    total: success + failed,
    success,
    failed,
    perDay: dayRows,
    byMethod: methodRows,
    byRole: roleRows,
    topEndpoints: pathRows,
    topErrors: errorRows,
  };
}
