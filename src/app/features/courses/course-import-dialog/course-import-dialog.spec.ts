import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { CourseService, ImportState } from '../../../core/courses/course.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseImportDialog, MAX_IMPORT_BYTES } from './course-import-dialog';

/**
 * jsdom n'implémente ni la modalité de <dialog> (showModal/close stubbés) ni
 * la sélection réelle de fichier : `onFileChange` est piloté avec un pseudo
 * input (`{ files, value }`), comme les FormControls des autres modales.
 */
describe('CourseImportDialog', () => {
  let importState: ReturnType<typeof signal<ImportState>>;
  let importCourse: ReturnType<typeof vi.fn>;
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  async function createComponent(): Promise<ComponentFixture<CourseImportDialog>> {
    importState = signal<ImportState>({ phase: 'idle', progress: 0 });
    importCourse = vi.fn();
    notifications = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [CourseImportDialog, provideTranslocoTesting()],
      providers: [
        provideRouter([]),
        {
          provide: CourseService,
          useValue: { importState: importState.asReadonly(), importCourse },
        },
        { provide: LanguageService, useValue: { lang: signal('fr').asReadonly() } },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CourseImportDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function dialog(fixture: ComponentFixture<CourseImportDialog>): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
  }

  function selectFile(fixture: ComponentFixture<CourseImportDialog>, file: File): void {
    (fixture.componentInstance as unknown as { onFileChange(event: Event): void }).onFileChange({
      target: { files: [file], value: '' },
    } as unknown as Event);
    fixture.detectChanges();
  }

  function submitButton(fixture: ComponentFixture<CourseImportDialog>): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.import-dialog__foot .btn--primary',
    )!;
  }

  function errorText(fixture: ComponentFixture<CourseImportDialog>): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector('.import-dialog__error')
        ?.textContent ?? ''
    );
  }

  it('open() ouvre la modale réinitialisée ; sans fichier, Importer est désactivé', async () => {
    const fixture = await createComponent();
    const showModal = (dialog(fixture).showModal = vi.fn());

    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(showModal).toHaveBeenCalledOnce();
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('affiche nom et taille du fichier choisi et active Importer', async () => {
    const fixture = await createComponent();
    selectFile(fixture, new File(['abc'], 'cours-fractions.zip', { type: 'application/zip' }));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('cours-fractions.zip');
    expect(submitButton(fixture).disabled).toBe(false);
    expect(errorText(fixture)).toBe('');
  });

  it('refuse un fichier au-dessus du plafond, sans requête', async () => {
    const fixture = await createComponent();
    const gros = new File(['x'], 'gros.zip', { type: 'application/zip' });
    Object.defineProperty(gros, 'size', { value: MAX_IMPORT_BYTES + 1 });
    selectFile(fixture, gros);

    expect(errorText(fixture)).not.toBe('');
    expect(submitButton(fixture).disabled).toBe(true);
    expect(importCourse).not.toHaveBeenCalled();
  });

  it('import réussi : ferme, toast succès, navigue vers le cours créé', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    const close = (dialog(fixture).close = vi.fn());
    importCourse.mockResolvedValue({ id: 'c-importe' });

    fixture.componentInstance.open();
    selectFile(fixture, new File(['zip'], 'cours.zip', { type: 'application/zip' }));
    submitButton(fixture).click();
    await fixture.whenStable();

    expect(importCourse).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalled();
    expect(notifications.success).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/', 'fr', 'courses', 'c-importe']);
  });

  it('422 → message « archive invalide », pas de navigation', async () => {
    const fixture = await createComponent();
    dialog(fixture).showModal = vi.fn();
    importCourse.mockRejectedValue(new HttpErrorResponse({ status: 422 }));

    selectFile(fixture, new File(['zip'], 'cours.zip', { type: 'application/zip' }));
    submitButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toContain('archive');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('pendant l’envoi : progression affichée, boutons figés, close() no-op', async () => {
    const fixture = await createComponent();
    const close = (dialog(fixture).close = vi.fn());
    selectFile(fixture, new File(['zip'], 'cours.zip', { type: 'application/zip' }));
    importState.set({ phase: 'uploading', progress: 40 });
    fixture.detectChanges();

    const progress = (fixture.nativeElement as HTMLElement).querySelector('progress')!;
    expect(progress.value).toBe(40);
    expect(submitButton(fixture).disabled).toBe(true);

    fixture.componentInstance.close();
    expect(close).not.toHaveBeenCalled();
  });
});
