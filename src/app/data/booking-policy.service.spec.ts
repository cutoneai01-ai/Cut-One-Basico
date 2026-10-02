import { TestBed } from '@angular/core/testing';
import type { BookingWindow } from '../booking/availability';
import { BookingPolicyService } from './booking-policy.service';
import { BookingService } from './booking.service';

// M-08 RN-DISPO-37: la política se pide una vez por carga de página y se expone como señal con tres
// estados. El asistente la espera si todavía no llegó, sin lanzar otra petición.

const POLICY: BookingWindow = {
  firstBookableDate: '2026-10-01',
  lastBookableDate: '2026-10-03',
  minLeadMinutes: 0,
  multiServiceBookingEnabled: true,
};

describe('BookingPolicyService', () => {
  let getBookingWindow: ReturnType<typeof vi.fn>;
  let resolvePolicy: (policy: BookingWindow) => void;
  let rejectPolicy: (error: unknown) => void;

  function setup(): BookingPolicyService {
    getBookingWindow = vi.fn(
      () =>
        new Promise<BookingWindow>((resolve, reject) => {
          resolvePolicy = resolve;
          rejectPolicy = reject;
        }),
    );
    TestBed.configureTestingModule({
      providers: [{ provide: BookingService, useValue: { getBookingWindow } }],
    });
    return TestBed.inject(BookingPolicyService);
  }

  it('arranca en «cargando» y no pide nada hasta ensureLoaded()', () => {
    const policy = setup();

    expect(policy.state()).toEqual({ status: 'loading' });
    expect(getBookingWindow).not.toHaveBeenCalled();
  });

  it('pasa a «lista» con la política del servidor', async () => {
    const policy = setup();

    const loaded = policy.ensureLoaded();
    resolvePolicy(POLICY);
    await loaded;

    expect(policy.state()).toEqual({ status: 'ready', policy: POLICY });
  });

  it('pasa a «falló» si la petición falla, y la promesa resuelve igual', async () => {
    const policy = setup();

    const loaded = policy.ensureLoaded();
    rejectPolicy(new Error('sin red'));

    await expect(loaded).resolves.toBeUndefined();
    expect(policy.state()).toEqual({ status: 'failed' });
  });

  it('se pide una sola vez aunque se llame varias, y todas esperan la misma petición', async () => {
    const policy = setup();

    const first = policy.ensureLoaded();
    const second = policy.ensureLoaded();
    resolvePolicy(POLICY);
    await Promise.all([first, second]);
    await policy.ensureLoaded();

    expect(second).toBe(first);
    expect(getBookingWindow).toHaveBeenCalledTimes(1);
  });
});
