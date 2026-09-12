import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ExportDialog, ExportRequest } from './export-dialog';

describe('ExportDialog', () => {
  let fixture: ComponentFixture<ExportDialog>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radio = (value: string): HTMLInputElement =>
    el().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  const button = (label: string): HTMLButtonElement =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExportDialog, provideTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(ExportDialog);
    const native = el().querySelector('dialog') as HTMLDialogElement;
    native.showModal = vi.fn();
    native.close = vi.fn();
    fixture.detectChanges();
  });

  it('defaults to PDF and hides the module option', () => {
    expect(radio('pdf').checked).toBe(true);
    expect(el().querySelector('.export-dialog__option')).toBeNull();
  });

  it('offers the live-modules option once HTML is picked', () => {
    radio('html').dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const option = el().querySelector<HTMLInputElement>('.export-dialog__option input')!;
    expect(option.checked).toBe(true);
  });

  it('emits the chosen format and option, without closing itself', () => {
    const emitted: ExportRequest[] = [];
    fixture.componentInstance.export.subscribe((request) => emitted.push(request));

    radio('html').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const option = el().querySelector<HTMLInputElement>('.export-dialog__option input')!;
    option.checked = false;
    option.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('Exporter').click();

    expect(emitted).toEqual([{ format: 'html', includeModules: false }]);
    // L'hôte décide de la fermeture (il peut avoir besoin de garder l'attente).
    expect((el().querySelector('dialog') as HTMLDialogElement).close).not.toHaveBeenCalled();
  });

  it('locks its buttons while the host is preparing the file', () => {
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(button('Exporter').disabled).toBe(true);
    expect(button('Annuler').disabled).toBe(true);
    expect(el().querySelector('.export-dialog__status')).not.toBeNull();
  });
});
