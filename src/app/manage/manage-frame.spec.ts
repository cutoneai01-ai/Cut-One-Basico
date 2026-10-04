import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ManageAppointment } from '../data/public-api.models';
import { ManageFrame } from './manage-frame';

// El marco de `/reserva/:id` (M-08 RN-DISPO-61): la cabecera con la barbería solo con la cita cargada.

describe('ManageFrame', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  async function render(appointment: ManageAppointment | null): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ManageFrame);
    fixture.componentRef.setInput('state', 'ready');
    fixture.componentRef.setInput('appointment', appointment);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('listo pero sin cita: no pinta cabecera ni contenido', async () => {
    const host = await render(null);

    expect(host.querySelector('header')).toBeNull();
    expect(host.querySelector('main')?.children).toHaveLength(0);
  });

  it('logo sin nombre de barbería: alt «Logo» y sin nombre en la cabecera', async () => {
    const host = await render({
      shopName: '',
      logoUrl: 'https://cdn.example/logo.png',
      publicPhone: '',
      whatsappNumber: '',
      appointmentId: 'appt-1',
      confirmationCode: 'ABC',
      status: 'Pending',
      barberId: 'juan',
      barberName: 'Juan',
      serviceId: 'corte',
      serviceName: 'Corte',
      price: 20000,
      durationMin: 30,
      startAtUtc: '2026-10-01T14:00:00Z',
      dateEs: 'jueves, 1 de octubre de 2026',
      customerName: 'Laura',
      editable: true,
      notEditableReason: null,
      confirmable: true,
      notConfirmableReason: null,
      cancelable: true,
      notCancelableReason: null,
      bookingGroupId: null,
      group: null,
    });

    expect(host.querySelector('img.header__logo')?.getAttribute('alt')).toBe('Logo');
    expect(host.querySelector('.header__shop')).toBeNull();
    expect(host.querySelector('header')?.textContent).toContain('Hola Laura');
  });
});
