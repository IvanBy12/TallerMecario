/**
 * Estructura declarativa de navegación y rutas de la aplicación.
 *
 * Fuente única: el shell (barra lateral / menú móvil) y el router se generan desde aquí, así que
 * añadir una sección es añadir una entrada, no editar componentes.
 *
 * `requiredPermission` existe para poder asociar el código de permiso cuando el backend entregue
 * el catálogo efectivo (G5/TA-02). Cada entrada usa un código estable del catálogo aprobado: **no** se ha inventado
 * ningún permiso, ninguna membership ni ningún taller. El filtro por permisos es UX; la
 * autorización real pertenece al backend (`docs/agents/tenant-rbac-rules.md`).
 */

/**
 * Código de permiso del catálogo aprobado (`docs/domain/roles-and-permissions.md`).
 * Se trata como cadena opaca: el backend devuelve códigos y scopes según me-and-workshop-context.md.
 */
export type PermissionCode = string;

export type NavigationIconName =
  | 'panel'
  | 'reception'
  | 'order'
  | 'customer'
  | 'vehicle'
  | 'inventory'
  | 'settings';

export interface NavigationItem {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  /** Resumen del módulo tomado del mapa funcional aprobado (`docs/product/product-overview.md`). */
  readonly summary: string;
  /** Elementos previstos del módulo, según el mismo mapa funcional. */
  readonly capabilities: readonly string[];
  readonly icon: NavigationIconName;
  /** `null` = visible con cualquier contexto válido (sin catálogo de permisos asignado todavía). */
  readonly requiredPermission: PermissionCode | null;
}

export interface NavigationSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

/** Destino de entrada al espacio autenticado. */
export const DASHBOARD_PATH = '/panel';

export const NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      {
        id: 'panel',
        path: DASHBOARD_PATH,
        label: 'Panel',
        summary: 'Resumen operativo del taller: qué está activo, qué está listo y qué requiere atención.',
        capabilities: [
          'Órdenes activas y vehículos del día',
          'Vehículos listos para entrega y alertas',
          'Ventas, recaudo, ticket promedio y participación (según el permiso del rol)',
          'Catálogo y stock',
        ],
        icon: 'panel',
        requiredPermission: 'dashboard.operational.read',
      },
      {
        id: 'recepciones',
        path: '/recepciones',
        label: 'Recepciones',
        summary: 'Ingreso del vehículo al taller y creación de la orden de trabajo.',
        capabilities: [
          'Búsqueda por placa',
          'Selección o creación de cliente y vehículo',
          'Kilometraje, combustible y observaciones',
          'Video, fotos, lista de comprobación, daños y firma',
        ],
        icon: 'reception',
        requiredPermission: 'receptions.read',
      },
      {
        id: 'ordenes',
        path: '/ordenes',
        label: 'Órdenes de trabajo',
        summary: 'Ciclo completo de la orden: del diagnóstico a la entrega.',
        capabilities: [
          'Listado y filtros por estado',
          'Detalle con recepción, diagnóstico y cotización',
          'Reparación, asignación técnica y evidencias',
          'Comunicaciones y entrega',
        ],
        icon: 'order',
        requiredPermission: 'orders.read',
      },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    items: [
      {
        id: 'clientes',
        path: '/clientes',
        label: 'Clientes',
        summary: 'Datos e historial de los clientes atendidos por el taller.',
        capabilities: [
          'Listado y datos de contacto',
          'Vehículos asociados',
          'Historial de servicios',
          'Comunicaciones',
        ],
        icon: 'customer',
        requiredPermission: 'customers.read',
      },
      {
        id: 'vehiculos',
        path: '/vehiculos',
        label: 'Vehículos',
        summary: 'Ficha e historial técnico de cada vehículo.',
        capabilities: [
          'Placa y datos del vehículo',
          'Propietarios',
          'Historial y kilometrajes',
          'Evidencia y mantenimiento',
        ],
        icon: 'vehicle',
        requiredPermission: 'vehicles.read',
      },
      {
        id: 'inventario',
        path: '/inventario',
        label: 'Inventario',
        summary: 'Productos, repuestos y existencias por ubicación.',
        capabilities: [
          'Catálogo de productos y repuestos',
          'Stock por ubicación',
          'Entradas, ajustes y transferencias',
          'Movimientos y consumo por orden',
        ],
        icon: 'inventory',
        requiredPermission: 'inventory.read',
      },
      {
        id: 'configuracion',
        path: '/configuracion',
        label: 'Configuración',
        summary: 'Parámetros del taller, usuarios y suscripción.',
        capabilities: [
          'Taller y logo',
          'Usuarios y roles',
          'Catálogo e inventario',
          'WhatsApp, plantillas y suscripción',
        ],
        icon: 'settings',
        requiredPermission: 'workshop.read',
      },
    ],
  },
];

/** Todas las entradas en orden de aparición. Es la tabla de rutas de la aplicación. */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = NAVIGATION_SECTIONS.flatMap(
  (section) => section.items,
);

/**
 * Catálogo de permisos efectivos de la sesión. `null` significa «todavía no hay catálogo»
 * (G5 pendiente): nada se filtra y no se afirma ningún permiso.
 */
export type GrantedPermissions = ReadonlySet<PermissionCode> | null;

export function isItemVisible(item: NavigationItem, granted: GrantedPermissions): boolean {
  if (item.requiredPermission === null) {
    return true;
  }
  return granted !== null && granted.has(item.requiredPermission);
}

export function visibleItems(
  items: readonly NavigationItem[],
  granted: GrantedPermissions,
): readonly NavigationItem[] {
  return items.filter((item) => isItemVisible(item, granted));
}

/** Descarta las secciones que se quedan sin entradas visibles. */
export function visibleSections(
  sections: readonly NavigationSection[],
  granted: GrantedPermissions,
): readonly NavigationSection[] {
  return sections
    .map((section) => ({ ...section, items: visibleItems(section.items, granted) }))
    .filter((section) => section.items.length > 0);
}
