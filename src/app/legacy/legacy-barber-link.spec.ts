// Caduca el 2027-04-10 (R-44).
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { legacyBarberLinkGuard } from './legacy-barber-link';

// M-08 RN-DISPO-68: `/?barbero={id}` lleva al perfil, sustituyendo la entrada del historial y con el
// resto de la URL intacto, y el ancla vieja ya traducida en el mismo salto (CB-07 RN-CBBAS-11).

@Component({ selector: 'cob-landing-stub', template: 'landing' })
class LandingStub {}

@Component({ selector: 'cob-profile-stub', template: 'perfil' })
class ProfileStub {}

const ID = '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21';

describe('legacyBarberLinkGuard: el enlace viejo ?barbero= lleva al perfil', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let location: SpyLocation;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideLocationMocks(),
        provideRouter([
          { path: '', canActivate: [legacyBarberLinkGuard], component: LandingStub },
          { path: 'profile/:barberId', component: ProfileStub },
          { path: 'otra', component: LandingStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location) as SpyLocation;
    // Una página anterior en el historial: así la redirección no es la navegación inicial, que el router
    // ya hace siempre con `replaceUrl`, y se ve que el `replaceUrl` es del guard.
    await harness.navigateByUrl('/otra');
  });

  it('redirige a /profile/{id} conservando los demás parámetros y un fragmento que no es viejo', async () => {
    await harness.navigateByUrl(`/?utm_source=whatsapp&barbero=${ID}&ref=story#otra`);

    expect(router.url).toBe(`/profile/${ID}?utm_source=whatsapp&ref=story#otra`);
    expect(harness.routeNativeElement?.textContent).toBe('perfil');
  });

  it('/?barbero={id}#reservar termina en /profile/{id}#book en un solo salto', async () => {
    const before = location.urlChanges.length;

    await harness.navigateByUrl(`/?barbero=${ID}#reservar`);

    expect(router.url).toBe(`/profile/${ID}#book`);
    expect(location.urlChanges.slice(before)).toEqual([`replace: /profile/${ID}#book`]);
  });

  it('sustituye la entrada del historial: «Atrás» no vuelve a la URL vieja', async () => {
    await harness.navigateByUrl(`/?barbero=${ID}`);

    expect(location.urlChanges.at(-1)).toBe(`replace: /profile/${ID}`);
    expect(location.urlChanges.some((change) => change.includes('barbero='))).toBe(false);
  });

  it('sin ?barbero= (o vacío) la landing se monta normal', async () => {
    await harness.navigateByUrl('/?utm_source=whatsapp');
    expect(router.url).toBe('/?utm_source=whatsapp');
    expect(harness.routeNativeElement?.textContent).toBe('landing');

    await harness.navigateByUrl('/?barbero=');
    expect(harness.routeNativeElement?.textContent).toBe('landing');
  });

  it('sin ?barbero= traduce igual el ancla vieja de /', async () => {
    await harness.navigateByUrl('/?utm_source=whatsapp#servicios');

    expect(router.url).toBe('/?utm_source=whatsapp#services');
    expect(harness.routeNativeElement?.textContent).toBe('landing');
    expect(location.urlChanges.at(-1)).toBe('replace: /?utm_source=whatsapp#services');
  });

  it('un id que no es de nadie también va al perfil: es el perfil quien lo descarta (M-08 RN-DISPO-63)', async () => {
    await harness.navigateByUrl('/?barbero=no-es-un-guid');

    expect(router.url).toBe('/profile/no-es-un-guid');
  });
});
