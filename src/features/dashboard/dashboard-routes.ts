/**
 * Destinos que el Dashboard puede enlazar. Los entrega la capa `app` (dueña del router): `null`
 * significa que el módulo todavía no tiene pantalla real y no debe generarse ningún enlace.
 */
export interface DashboardRoutes {
  readonly newReception: string | null;
  readonly receptions: string | null;
  readonly customers: string | null;
  readonly vehicles: string | null;
}
