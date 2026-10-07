import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { resetTenantTerminology, setTenantTerminology } from '../core/tenant-terminology';
import { TermPipe } from './term.pipe';

@Component({
  selector: 'cob-term-host',
  imports: [TermPipe],
  template: `<p>Elige tu {{ 'staff' | term }} en {{ 'laBiz' | term }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TermHost {}

describe('TermPipe', () => {
  afterEach(() => resetTenantTerminology());

  async function render(): Promise<{ text: () => string; stable: () => Promise<unknown> }> {
    const fixture = TestBed.createComponent(TermHost);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    return { text: () => host.textContent?.trim() ?? '', stable: () => fixture.whenStable() };
  }

  it('pinta las formas de Barbería por defecto', async () => {
    const view = await render();
    expect(view.text()).toBe('Elige tu barbero en la barbería');
  });

  it('se repinta sola cuando llega otra terminología, aunque el argumento sea el mismo', async () => {
    const view = await render();

    setTenantTerminology({
      staffSingular: 'colaborador',
      staffPlural: 'colaboradores',
      businessSingular: 'spa',
      businessPlural: 'spas',
      businessGender: 'masculine',
    });
    await view.stable();

    expect(view.text()).toBe('Elige tu colaborador en el spa');
  });
});
