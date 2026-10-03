import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { legacyBarberLinkGuard } from './legacy-barber-link';

// M-08 RN-DISPO-68: `/?barbero={id}` lleva al perfil, sustituyendo la entrada del historial y con el
// resto de la URL intacto. Ya no preselecciona nada: la landing ni siquiera llega a montarse.

@Component({ template: 'landing' })
class LandingStub {}

@Component({ template: 'perfil' })
class ProfileStub {}

const ID = '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21';

describe('legacyBarberLinkGuard: el enlace viejo ?barbero= lleva al perfil', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let location: Location;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', canActivate: [legacyBarberLinkGuard], component: LandingStub },
          { path: 'profile/:barberId', component: ProfileStub },
          { path: 'otra', component: LandingStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    // Una página anterior en el historial: así la redirección no es la navegación inicial, que el router
    // ya hace siempre con `replaceUrl`, y se ve que el `replaceUrl` es del guard.
    await harness.navigateByUrl('/otra');
  });

  it('redirige a /profile/{id} conservando los demás parámetros y el fragmento', async () => {
    await harness.navigateByUrl(`/?utm_source=whatsapp&barbero=${ID}&ref=story#servicios`);

    expect(router.url).toBe(`/profile/${ID}?utm_source=whatsapp&ref=story#servicios`);
    expect(harness.routeNativeElement?.textContent).toBe('perfil');
  });

  it('sustituye la entrada del historial: «Atrás» no vuelve a la URL vieja', async () => {
    const go = vi.spyOn(location, 'go');
    const replaceState = vi.spyOn(location, 'replaceState');

    await harness.navigateByUrl(`/?barbero=${ID}`);

    expect(replaceState).toHaveBeenCalledWith(`/profile/${ID}`, '', expect.anything());
    expect(go).not.toHaveBeenCalled();
  });

  it('sin ?barbero= (o vacío) la landing se monta normal', async () => {
    await harness.navigateByUrl('/?utm_source=whatsapp');
    expect(router.url).toBe('/?utm_source=whatsapp');
    expect(harness.routeNativeElement?.textContent).toBe('landing');

    await harness.navigateByUrl('/?barbero=');
    expect(harness.routeNativeElement?.textContent).toBe('landing');
  });

  it('un id que no es de nadie también va al perfil: es el perfil quien lo descarta (M-08 RN-DISPO-63)', async () => {
    await harness.navigateByUrl('/?barbero=no-es-un-guid');

    expect(router.url).toBe('/profile/no-es-un-guid');
  });
});
