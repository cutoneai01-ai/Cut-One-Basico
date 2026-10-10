// Caduca el 2027-04-10 (R-44).
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationSkipped, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { legacyAnchorGuard, translateLegacyAnchor } from './legacy-anchors';

// CB-07 RN-CBBAS-11: un ancla vieja se cambia por la nueva al cargar `/` o `/profile/:id`, sustituyendo
// la entrada del historial y antes de que el router desplace a la sección.

@Component({ selector: 'cob-landing-stub', template: 'landing' })
class LandingStub {}

@Component({ selector: 'cob-other-stub', template: 'otra' })
class OtherStub {}

const ID = '3f2b8c1e-5d4a-4c3b-9a8e-7f6d5c4b3a21';

const ANCHORS: readonly [string, string][] = [
  ['servicios', 'services'],
  ['barberos', 'team'],
  ['nosotros', 'about'],
  ['contacto', 'contact'],
  ['reservar', 'book'],
  ['lo-mas-pedido', 'popular'],
  ['tu-barbero', 'member'],
];

describe('translateLegacyAnchor', () => {
  it.each(ANCHORS)('#%s → #%s', (legacy, current) => {
    expect(translateLegacyAnchor(legacy)).toBe(current);
  });

  it.each([null, undefined, '', 'team', 'services', 'top', 'otra-cosa', 'Barberos'])(
    '«%s» no es un ancla vieja',
    (fragment) => {
      expect(translateLegacyAnchor(fragment)).toBeNull();
    },
  );
});

describe('legacyAnchorGuard', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let location: SpyLocation;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideLocationMocks(),
        provideRouter([
          { path: '', canActivate: [legacyAnchorGuard], component: LandingStub },
          { path: 'profile/:barberId', canActivate: [legacyAnchorGuard], component: LandingStub },
          { path: 'otra', component: OtherStub },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location) as SpyLocation;
    // Una página anterior: la navegación inicial ya usa `replaceUrl`, así se ve que es del guard.
    await harness.navigateByUrl('/otra');
  });

  it.each(ANCHORS)('en / cambia #%s por #%s, con los parámetros y sin entrada nueva', async (legacy, current) => {
    await harness.navigateByUrl(`/?utm_source=whatsapp#${legacy}`);

    expect(router.url).toBe(`/?utm_source=whatsapp#${current}`);
    expect(harness.routeNativeElement?.textContent).toBe('landing');
    expect(location.urlChanges.at(-1)).toBe(`replace: /?utm_source=whatsapp#${current}`);
    expect(location.urlChanges.some((change) => change.includes(`#${legacy}`))).toBe(false);
  });

  it.each(ANCHORS)('en /profile/{id} cambia #%s por #%s', async (legacy, current) => {
    await harness.navigateByUrl(`/profile/${ID}?ref=story#${legacy}`);

    expect(router.url).toBe(`/profile/${ID}?ref=story#${current}`);
    expect(location.urlChanges.at(-1)).toBe(`replace: /profile/${ID}?ref=story#${current}`);
  });

  it('un ancla nueva, otra cualquiera o ninguna no redirige', async () => {
    for (const url of ['/#team', '/#top', `/profile/${ID}#book`, '/?utm_source=x']) {
      await harness.navigateByUrl(url);

      expect(router.url).toBe(url);
      expect(location.urlChanges.at(-1)).toBe(url);
    }
  });

  // El `anchorScrolling` desplaza al fragmento de cada `NavigationEnd`: si ninguno lleva el viejo, el
  // único desplazamiento es a la sección nueva.
  it('la navegación que termina ya lleva el ancla nueva: el router nunca desplaza a la vieja', async () => {
    const ended: string[] = [];
    const subscription = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd || event instanceof NavigationSkipped) {
        ended.push(event instanceof NavigationEnd ? event.urlAfterRedirects : event.url);
      }
    });

    await harness.navigateByUrl(`/profile/${ID}#barberos`);
    subscription.unsubscribe();

    expect(ended).toEqual([`/profile/${ID}#team`]);
  });
});
