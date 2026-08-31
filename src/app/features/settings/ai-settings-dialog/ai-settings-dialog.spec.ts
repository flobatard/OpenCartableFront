import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY_AI_CREDENTIALS } from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AiSettingsDialog } from './ai-settings-dialog';

/**
 * jsdom n'implémente pas la modalité de <dialog> (showModal/close) : on les
 * stubbe sur l'élément et on vérifie le montage/démontage du contenu.
 */
describe('AiSettingsDialog', () => {
  async function createComponent(): Promise<ComponentFixture<AiSettingsDialog>> {
    await TestBed.configureTestingModule({
      imports: [AiSettingsDialog, provideTranslocoTesting()],
      providers: [
        // L'écran de réglages encastré consomme le service credentials.
        {
          provide: AiCredentialsService,
          useValue: {
            credentials: signal(EMPTY_AI_CREDENTIALS),
            ensureLoaded: vi.fn().mockResolvedValue(EMPTY_AI_CREDENTIALS),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AiSettingsDialog);
    fixture.detectChanges();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<AiSettingsDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  it('mounts the embedded AI settings only at first open (no page title chrome)', async () => {
    const fixture = await createComponent();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-ai-settings')).toBeNull();

    const showModal = (dialog(fixture).showModal = vi.fn());
    fixture.componentInstance.open();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(showModal).toHaveBeenCalledOnce();
    const settings = (fixture.nativeElement as HTMLElement).querySelector('app-ai-settings')!;
    expect(settings).toBeTruthy();
    // Mode encastré : le titre/l'intro de la page sont masqués, la modale porte le sien.
    expect(settings.querySelector('.ai-settings__title')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Réglages IA');
  });

  it('keeps the content mounted across close (state survives reopening)', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    const close = (dialog(fixture).close = vi.fn());

    fixture.componentInstance.open();
    fixture.detectChanges();
    fixture.componentInstance.close();
    fixture.detectChanges();

    expect(close).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-ai-settings')).toBeTruthy();
  });
});
