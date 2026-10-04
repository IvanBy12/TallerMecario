import { expect, type Page } from '@playwright/test';

import { expectWorkshopShell } from './clerk-login';
import { plateForRun } from './env';
import { expectSignatureInk, SIGNATURE_CANVAS_LABEL } from './signature-ink';

/**
 * Pasos de UI del flujo de recepción, con los textos reales de la aplicación (src/features/reception, src/shared/crm).
 * Todo ocurre por la interfaz; ningún paso inserta datos por API o base de datos.
 */

export interface RunFixture {
  readonly runId: string;
  readonly plate: string;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Datos ÚNICOS por corrida (placa, nombre del cliente). Cada test que crea una recepción abierta pide su propio `newRunId()`:
 * jamás se reutiliza un vehículo fijo, porque un vehículo con recepción abierta rompería la corrida siguiente.
 */
export function runFixture(runId: string): RunFixture {
  return {
    runId,
    plate: plateForRun(runId),
    // Nombre único por corrida: es lo que busca el selector de propietario del formulario de vehículo.
    firstName: `E2E${runId}`,
    lastName: 'Playwright',
  };
}

/** En el viewport móvil nada debe forzar scroll horizontal de la página. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'desbordamiento horizontal de la página (px)').toBeLessThanOrEqual(0);
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('/panel');
  await expectWorkshopShell(page);
}

export async function goToSection(page: Page, label: 'Panel' | 'Recepciones' | 'Clientes' | 'Vehículos'): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Menú', exact: true });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: label, exact: true }).click();
}

async function searchPlate(page: Page, plate: string): Promise<void> {
  await page.getByLabel('Buscar vehículo por placa', { exact: true }).fill(plate);
  await page.getByRole('button', { name: 'Buscar vehículo', exact: true }).click();
}

/** Crea cliente → vehículo por la UI de CRM con retorno a /recepciones/nueva. Parte de «búsqueda sin resultados». */
async function createCustomerAndVehicle(page: Page, fixture: RunFixture): Promise<void> {
  await page.getByRole('link', { name: 'Crear cliente y luego vehículo' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo cliente' })).toBeVisible();
  await page.locator('#crm-firstName').fill(fixture.firstName);
  await page.locator('#crm-lastName').fill(fixture.lastName);
  await page.locator('#crm-phone').fill(`300${Date.now().toString().slice(-7)}`);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Nuevo vehículo' })).toBeVisible();
  await page.locator('#owner-search-value').fill(fixture.firstName);
  await page.getByRole('button', { name: 'Buscar cliente', exact: true }).click();
  await page.getByRole('button', { name: `Seleccionar ${fixture.firstName} ${fixture.lastName}`, exact: true }).click();
  await page.locator('#crm-plate').fill(fixture.plate);
  await page.locator('#crm-brand').fill('E2E Marca');
  await page.locator('#crm-model').fill('E2E Modelo');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nueva recepción' })).toBeVisible();
}

export type VehiclePath = 'existing' | 'created';

/** Busca la placa; si no existe, crea cliente y vehículo y vuelve a buscar. Deja el vehículo seleccionado. */
export async function selectOrCreateVehicle(page: Page, fixture: RunFixture): Promise<VehiclePath> {
  let path: VehiclePath = 'existing';
  await searchPlate(page, fixture.plate);
  const hit = page.getByRole('button', { name: new RegExp(`^${fixture.plate} — `) });
  const none = page.getByText('No se encontraron resultados.');
  await hit.or(none).first().waitFor();
  if (await none.isVisible()) {
    await createCustomerAndVehicle(page, fixture);
    path = 'created';
    await searchPlate(page, fixture.plate);
  }
  await hit.click();
  await expect(page.getByRole('heading', { name: `Vehículo: ${fixture.plate}` })).toBeVisible();
  return path;
}

/** Propietario vigente → autorización de datos (service_provision + atestación de mayoría de edad). */
export async function confirmOwnerAndConsent(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Consultar propietario vigente' }).click();
  await page.getByRole('button', { name: 'Confirmar propietario y consultar autorización' }).click();
  const consentForm = page.getByRole('heading', { name: 'Autorización de datos personales' });
  const alreadyGranted = page.getByText('Autorización vigente para la prestación del servicio.');
  await consentForm.or(alreadyGranted).first().waitFor();
  if (await consentForm.isVisible()) {
    await page.getByLabel('El propietario declara expresamente que es mayor de edad.').check();
    await page.getByLabel('El propietario autoriza el tratamiento descrito para la prestación del servicio.').check();
    await page.getByRole('button', { name: 'Registrar autorización' }).click();
  }
  await expect(alreadyGranted).toBeVisible();
}

export interface Intake {
  readonly mileageKm: string;
  readonly fuelLevelPct: string;
  readonly customerNotes: string;
  readonly advisorNotes: string;
}

export function intakeFor(runId: string): Intake {
  return {
    mileageKm: '120345',
    fuelLevelPct: '55',
    customerNotes: `E2E ${runId}: ruido al frenar`,
    advisorNotes: `E2E ${runId}: revisar pastillas`,
  };
}

/** Rellena el ingreso, crea la recepción y devuelve su ID (desde la URL de detalle). */
export async function submitIntake(page: Page, intake: Intake): Promise<string> {
  await page.getByLabel('Kilometraje (km)').fill(intake.mileageKm);
  await page.getByLabel('Combustible (%)').fill(intake.fuelLevelPct);
  await page.getByLabel('Observaciones del cliente').fill(intake.customerNotes);
  await page.getByLabel('Notas internas del asesor').fill(intake.advisorNotes);
  await page.getByRole('button', { name: 'Crear recepción', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Detalle de recepción' })).toBeVisible();
  await expect(page).toHaveURL(/\/recepciones\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Abierta', { exact: true })).toBeVisible();
  return receptionIdOf(page);
}

export function receptionIdOf(page: Page): string {
  const match = /\/recepciones\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(page.url());
  const id = match?.[1];
  if (id === undefined) throw new Error('La URL actual no es el detalle de una recepción.');
  return id;
}

/** Recorrido completo desde el panel hasta una recepción abierta (navegación por menú, como un asesor en móvil). */
export async function createReceptionViaUi(page: Page, fixture: RunFixture, intake: Intake): Promise<{ receptionId: string; vehiclePath: VehiclePath }> {
  await openApp(page);
  await goToSection(page, 'Recepciones');
  await expect(page.getByRole('heading', { name: 'Recepciones', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Nueva recepción', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nueva recepción' })).toBeVisible();
  const vehiclePath = await selectOrCreateVehicle(page, fixture);
  await confirmOwnerAndConsent(page);
  const receptionId = await submitIntake(page, intake);
  return { receptionId, vehiclePath };
}

export interface InspectionFixture {
  readonly checklistCode: string;
  readonly checklistLabel: string;
  readonly checklistNotes: string;
  readonly damageZone: string;
  readonly damageType: string;
  readonly damageDescription: string;
}

export function inspectionFor(runId: string): InspectionFixture {
  return {
    checklistCode: `luces-${runId.toLowerCase()}`,
    checklistLabel: 'Luces delanteras',
    checklistNotes: `E2E ${runId}: foco izquierdo débil`,
    damageZone: 'puerta_delantera_izquierda',
    damageType: 'rayon',
    damageDescription: `E2E ${runId}: rayón de 10 cm`,
  };
}

/** Agrega un elemento de checklist, lo edita (Novedad → Correcto) y agrega un daño. */
export async function inspectChecklistAndDamage(page: Page, item: InspectionFixture): Promise<void> {
  await page.getByRole('button', { name: 'Agregar elemento de checklist' }).click();
  const checklistForm = page.getByRole('form', { name: 'Edición de checklist' });
  await checklistForm.getByLabel('Código del elemento', { exact: true }).fill(item.checklistCode);
  await checklistForm.getByLabel('Elemento del checklist', { exact: true }).fill(item.checklistLabel);
  await checklistForm.getByLabel('Estado del elemento', { exact: true }).selectOption({ label: 'Novedad' });
  await checklistForm.getByLabel('Notas del checklist (opcional)', { exact: true }).fill(item.checklistNotes);
  await checklistForm.getByRole('button', { name: 'Guardar checklist' }).click();
  await expect(page.getByText(`${item.checklistLabel}: Novedad`)).toBeVisible();

  await page.getByRole('button', { name: `Editar elemento ${item.checklistLabel}` }).click();
  const editForm = page.getByRole('form', { name: 'Edición de checklist' });
  await editForm.getByLabel('Estado del elemento', { exact: true }).selectOption({ label: 'Correcto' });
  await editForm.getByRole('button', { name: 'Guardar checklist' }).click();
  await expect(page.getByText(`${item.checklistLabel}: Correcto`)).toBeVisible();

  await page.getByRole('button', { name: 'Agregar daño' }).click();
  const damageForm = page.getByRole('form', { name: 'Edición de daño' });
  await damageForm.getByLabel('Zona', { exact: true }).fill(item.damageZone);
  await damageForm.getByLabel('Tipo de daño', { exact: true }).fill(item.damageType);
  await damageForm.getByLabel('Severidad', { exact: true }).selectOption({ label: 'Moderado' });
  await damageForm.getByLabel('Descripción opcional', { exact: true }).fill(item.damageDescription);
  await damageForm.getByRole('button', { name: 'Guardar daño' }).click();
  await expect(page.getByText(`${item.damageZone} · ${item.damageType} · Moderado`)).toBeVisible();
}

export async function expectInspectionPersisted(page: Page, item: InspectionFixture): Promise<void> {
  await expect(page.getByText(`${item.checklistLabel}: Correcto`)).toBeVisible();
  await expect(page.getByText(item.checklistNotes)).toBeVisible();
  await expect(page.getByText(`${item.damageZone} · ${item.damageType} · Moderado`)).toBeVisible();
  await expect(page.getByText(item.damageDescription)).toBeVisible();
}

/**
 * Dibuja un trazo en el canvas con eventos TÁCTILES reales: CDP `Input.dispatchTouchEvent` genera pointer events con
 * pointerType=touch. El gate es móvil: no hay rama de ratón ni fallback silencioso. Verifica que el canvas recibió solo
 * pointer events táctiles. El canvas fija touch-action:none.
 */
export async function drawSignature(page: Page): Promise<void> {
  const canvas = page.getByLabel(SIGNATURE_CANVAS_LABEL);
  await canvas.scrollIntoViewIfNeeded();
  if (!(await page.evaluate(() => navigator.maxTouchPoints > 0))) {
    throw new Error('El gate móvil exige un contexto táctil (navigator.maxTouchPoints > 0): no se dibuja con ratón.');
  }
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('El canvas de firma no tiene caja visible.');
  const points = Array.from({ length: 24 }, (_, index) => ({
    x: box.x + box.width * (0.12 + (index / 23) * 0.76),
    y: box.y + box.height * (0.5 + Math.sin(index / 3) * 0.28),
  }));
  const first = points[0];
  if (first === undefined) throw new Error('Trazo vacío.');
  await canvas.evaluate((element) => {
    const seen: string[] = [];
    Reflect.set(window, '__signaturePointerTypes', seen);
    for (const type of ['pointerdown', 'pointermove']) {
      element.addEventListener(type, (event) => {
        if (event instanceof PointerEvent) seen.push(event.pointerType);
      }, true);
    }
  });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    for (const point of points.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  const pointerTypes = await page.evaluate(() => Reflect.get(window, '__signaturePointerTypes') as string[]);
  if (pointerTypes.length === 0 || pointerTypes.some((type) => type !== 'touch')) {
    throw new Error(`El trazo no llegó como pointer events táctiles (tipos observados: ${[...new Set(pointerTypes)].join(', ') || 'ninguno'}).`);
  }
}

/** Documento de aceptación real → nombre → lectura → firma táctil con tinta verificada → registrar. Termina con «Firma registrada». */
export async function registerSignature(page: Page, signerName: string): Promise<void> {
  await expect(page.getByText(/^Versión: /)).toBeVisible();
  await page.getByLabel('Nombre del firmante *', { exact: true }).fill(signerName);
  await page.getByLabel('He leído el documento de aceptación mostrado.', { exact: true }).check();
  await drawSignature(page);
  // «Registrar firma» habilitado no prueba tinta: se inspeccionan los píxeles del canvas (solo métricas, sin guardar el PNG).
  await expectSignatureInk(page);
  const submit = page.getByRole('button', { name: 'Registrar firma', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('Firma registrada', { exact: true })).toBeVisible({ timeout: 90_000 });
}

/** Cierra la recepción confirmando el diálogo y devuelve el número de orden mostrado. */
export async function closeReception(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Cerrar recepción', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar recepción', exact: true }).click();
  await expect(page.getByText('Generada correctamente')).toBeVisible({ timeout: 60_000 });
  return orderNumberShown(page);
}

export async function orderNumberShown(page: Page): Promise<string> {
  const heading = page.getByRole('heading', { name: /^Orden #\d+$/ });
  await expect(heading).toBeVisible();
  const text = (await heading.textContent()) ?? '';
  const match = /^Orden #(\d+)$/.exec(text.trim());
  const orderNumber = match?.[1];
  if (orderNumber === undefined) throw new Error('No se pudo leer el número de orden mostrado.');
  return orderNumber;
}
