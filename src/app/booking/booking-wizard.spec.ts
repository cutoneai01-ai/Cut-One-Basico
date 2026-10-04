import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { clearTenantLocale, setTenantLocale } from '../core/locale';
import { BookingPolicyService } from '../data/booking-policy.service';
import { BookingService } from '../data/booking.service';
import { CatalogService } from '../data/catalog.service';
import type { PublicBarber, PublicService } from '../data/public-api.models';
import { SettingsService } from '../data/settings.service';
import { BookingWizard } from './booking-wizard';

// M-08 RN-DISPO-35 y ADR-0044: el asistente muestra el tiempo de cada barbero para el servicio elegido.
// Solo se pinta: las horas y la duración real de la cita las calcula el servidor. Aquí se comprueba que
// cada punto donde se ve la duración lee el tiempo del barbero correcto, y el base cuando no hay barbero
// concreto o el backend todavía no manda `barberDurations`.

function barber(id: string, displayName: string): PublicBarber {
  return { id, displayName, specialty: null, photoUrl: null, rating: null };
}

const fast = barber('barber-fast', 'Felipe');
const slow = barber('barber-slow', 'Andrés');
const plain = barber('barber-plain', 'Camilo');

function service(overrides: Partial<PublicService> = {}): PublicService {
  return {
    id: 'service-cut',
    name: 'Corte',
    description: null,
    price: 30000,
    durationMin: 30,
    category: null,
    isPopular: false,
    imageUrl: null,
    barberIds: [fast.id, slow.id, plain.id],
    barberDurations: [
      { barberId: fast.id, durationMin: 20 },
      { barberId: slow.id, durationMin: 45 },
    ],
    ...overrides,
  };
}

const beard = service({
  id: 'service-beard',
  name: 'Barba',
  durationMin: 15,
  barberDurations: [{ barberId: fast.id, durationMin: 10 }],
});

/**
 * El asistente vive en un `p-dialog`, y abrirlo en jsdom es caro sin aportar nada a estas pruebas: el
 * diálogo, al terminar de entrar, llama a `getComputedStyle` para cada elemento enfocable (dos veces, al
 * probar contenido, pie, cabecera y otra vez contenido), y su animación lo llama para leer la duración
 * de la transición. jsdom resuelve cada llamada recorriendo todas las reglas de todas las hojas y de los
 * ancestros: medido el 2026-10-02, era más de la mitad del tiempo de CPU de
 * cada prueba, y la primera del archivo pasaba de 5 s de CPU — con la máquina cargada, 42 s y fuera del
 * límite de 15 s. Y el resultado no se usa: jsdom no maqueta, `offsetParent` es siempre `null`, así que
 * PrimeNG nunca da por visible ningún elemento ni enfoca nada. El doble devuelve el estilo en línea del
 * elemento, que no declara animación: la entrada del diálogo termina en el acto. Lo que comprueban estas
 * pruebas (textos, pasos, llamadas) no pasa por aquí.
 */
function withoutJsdomStyleEngine(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => (element as HTMLElement).style);
}


/** El catálogo ya cargado: el asistente lo revalida al abrir y lee si carga o falló (CB-03 RN-CBRES-09). */
function catalogDouble() {
  return { loading: signal(false), failed: signal(false), revalidate: () => Promise.resolve() };
}

describe('BookingWizard: tiempo de cada barbero', () => {
  let fixture: ComponentFixture<BookingWizard>;
  let wizard: BookingWizard;

  beforeEach(async () => {
    withoutJsdomStyleEngine();
    TestBed.configureTestingModule({
      imports: [BookingWizard],
      providers: [
        // Sin tema: estas pruebas no miran la apariencia, y generar y cargar el CSS del tema de PrimeNG
        // en jsdom era cerca de 1 s de CPU de la primera prueba del archivo.
        providePrimeNG({ theme: 'none' }),
        MessageService,
        {
          provide: BookingService,
          useValue: {
            // Sin ventana el asistente no pide disponibilidad: estas pruebas no dependen de la red.
            getBookingWindow: () => Promise.reject(new Error('sin red en pruebas')),
            getAvailability: () => Promise.reject(new Error('sin red en pruebas')),
          },
        },
        { provide: CatalogService, useValue: catalogDouble() },
        {
          provide: SettingsService,
          useValue: { requireLocale: () => Promise.reject(new Error('sin red en pruebas')) },
        },
      ],
    });

    // Como en la página: la política se pidió al cargarla (M-08 RN-DISPO-37) y aquí ya falló, así que
    // el asistente fija su paso al abrir, en modo un servicio.
    await TestBed.inject(BookingPolicyService).ensureLoaded();

    fixture = TestBed.createComponent(BookingWizard);
    wizard = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    clearTenantLocale();
    vi.restoreAllMocks();
  });

  async function render(services: PublicService[]): Promise<HTMLElement> {
    fixture.componentRef.setInput('services', services);
    fixture.componentRef.setInput('barbers', [fast, slow, plain]);
    await refresh();
    // El diálogo de PrimeNG puede montarse fuera del host: se busca en todo el documento.
    return document.body;
  }

  async function refresh(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Lleva el asistente al paso 4 (resumen) con el barbero ya elegido. */
  async function goToRecap(): Promise<void> {
    wizard['step'].set(4);
    await refresh();
  }

  function texts(host: HTMLElement, selector: string): string[] {
    return Array.from(host.querySelectorAll(selector)).map((el) => (el.textContent ?? '').trim());
  }

  /**
   * Duración que pinta la tarjeta de un servicio, localizada por su nombre: el stepper conserva en el
   * DOM los pasos ya visitados, así que un selector genérico mezclaría tarjetas de servicio y de barbero.
   */
  function serviceCardDuration(host: HTMLElement, name: string): { text: string; active: boolean } {
    const card = Array.from(host.querySelectorAll<HTMLButtonElement>('button.option')).find(
      (button) => button.querySelector('strong')?.textContent?.trim() === name,
    );
    if (!card) {
      throw new Error(`No se pintó la tarjeta del servicio ${name}`);
    }
    return {
      text: (card.querySelector('.option__duration')?.textContent ?? '').trim(),
      active: card.classList.contains('option--active'),
    };
  }

  it('paso 2: cada tarjeta muestra el tiempo de su barbero y «cualquiera» el base', async () => {
    const host = await render([service()]);
    wizard.open(service());
    await refresh();

    expect(texts(host, '.option__duration')).toEqual(['30 min', '20 min', '45 min', '30 min']);
  });

  // CB-03 RN-CBRES-03 y CB-07 RN-CBBAS-08: el avatar compartido, con aro y hover del color propio.
  it('paso 2: foto o iniciales en el círculo, y el color propio solo en quien lo tiene', async () => {
    const host = await render([service()]);
    fixture.componentRef.setInput('barbers', [
      { ...fast, photoUrl: 'https://cdn.example/felipe.webp', color: '#e11d48' },
      { ...slow, color: '#2563eb' },
      plain,
    ]);
    wizard.open(service());
    await refresh();

    const option = (name: string): HTMLButtonElement =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('button.option')).find(
        (button) => button.querySelector('strong')?.textContent?.trim() === name,
      )!;

    const avatar = (button: HTMLElement): HTMLElement => button.querySelector<HTMLElement>('cob-barber-avatar.option__avatar')!;

    const felipe = option('Felipe');
    expect(avatar(felipe).querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/felipe.webp');
    expect(avatar(felipe).style.getPropertyValue('--barber-color')).toBe('#e11d48');
    expect(avatar(felipe).classList).toContain('avatar--md');
    expect(felipe.style.getPropertyValue('--barber-color')).toBe('#e11d48');
    expect(felipe.classList).toContain('option--colored');

    const andres = option('Andrés');
    expect(andres.querySelector('img')).toBeNull();
    expect(avatar(andres).textContent?.trim()).toBe('A');
    expect(avatar(andres).getAttribute('aria-hidden')).toBe('true');
    expect(andres.style.getPropertyValue('--barber-color')).toBe('#2563eb');

    const camilo = option('Camilo');
    expect(avatar(camilo).textContent?.trim()).toBe('C');
    expect(camilo.style.getPropertyValue('--barber-color')).toBe('');
    expect(camilo.classList).not.toContain('option--colored');

    // «Cualquier profesional» conserva su icono.
    expect(option('Cualquier profesional').querySelector('.option__glyph .pi-sparkles')).not.toBeNull();
  });

  it('elegir barbero pone su tiempo en el resumen, y cambiar de barbero lo cambia', async () => {
    const host = await render([service()]);
    wizard.open(service());
    await refresh();

    wizard['chooseBarber'](fast);
    await goToRecap();
    expect(texts(host, '.summary__duration dd')).toEqual(['20 min']);

    wizard['chooseBarber'](slow);
    await goToRecap();
    expect(texts(host, '.summary__duration dd')).toEqual(['45 min']);

    wizard['chooseBarber'](plain);
    await goToRecap();
    expect(texts(host, '.summary__duration dd')).toEqual(['30 min']);
  });

  it('al volver al paso 1 con barbero elegido, el servicio seleccionado muestra su tiempo', async () => {
    const host = await render([service(), beard]);
    wizard.open(service());
    await refresh();

    wizard['chooseBarber'](slow);
    wizard['step'].set(1);
    await refresh();

    // `slow` solo tiene tiempo propio en el corte; en la barba se muestra el base.
    expect(serviceCardDuration(host, 'Corte')).toEqual({ text: '45 min', active: true });
    expect(serviceCardDuration(host, 'Barba')).toEqual({ text: '15 min', active: false });
  });

  it('«cualquier profesional»: el resumen muestra el base marcado como aproximado', async () => {
    const host = await render([service()]);
    wizard.open(service());
    await refresh();

    wizard['chooseAnyBarber']();
    await goToRecap();

    expect(texts(host, '.summary__duration dd')).toEqual(['30 min (aprox.)']);
  });

  it('pasar de «cualquiera» a un barbero concreto quita el «(aprox.)»', async () => {
    const host = await render([service()]);
    wizard.open(service());
    wizard['chooseAnyBarber']();
    wizard['chooseBarber'](fast);
    await goToRecap();

    expect(texts(host, '.summary__duration dd')).toEqual(['20 min']);
  });

  it('con el barbero bloqueado del perfil, el selector de servicio muestra el tiempo de ese barbero', async () => {
    const host = await render([service(), beard]);
    fixture.componentRef.setInput('lockedBarber', fast);
    wizard.open();
    await refresh();

    expect(texts(host, '.option__duration')).toEqual(['20 min', '10 min']);
  });

  it('sin barbero fijado, el selector de servicio muestra el base', async () => {
    const host = await render([service(), beard]);
    wizard.open();
    await refresh();

    expect(texts(host, '.option__duration')).toEqual(['30 min', '15 min']);
  });

  it('sin barberDurations (backend anterior) todo se muestra con el base', async () => {
    const legacy = service({ barberDurations: undefined });
    const host = await render([legacy]);
    wizard.open(legacy);
    await refresh();

    expect(texts(host, '.option__duration')).toEqual(['30 min', '30 min', '30 min', '30 min']);

    wizard['chooseBarber'](fast);
    await goToRecap();
    expect(texts(host, '.summary__duration dd')).toEqual(['30 min']);
  });

  it('la confirmación pinta la duración real que devuelve el servidor', async () => {
    // La hora de la confirmación se pinta en la zona de la barbería (M-02 RN-TEN-20).
    setTenantLocale({
      time_zone: 'America/Bogota',
      currency: 'COP',
      currency_decimals: 0,
      locale: 'es-CO',
      place: 'Bogotá, Colombia',
      offset_label: 'UTC-5',
    });
    const host = await render([service()]);
    wizard.open(service());
    wizard['chooseAnyBarber']();
    wizard['created'].set({
      appointmentId: 'a-1',
      confirmationCode: 'ABC123',
      status: 'Pending',
      barberName: 'Andrés',
      serviceName: 'Corte',
      startAtUtc: '2026-09-28T15:00:00Z',
      durationMin: 45,
    });
    await refresh();

    expect(host.querySelector('.done .summary')?.textContent).toContain('45 min');
  });
});
