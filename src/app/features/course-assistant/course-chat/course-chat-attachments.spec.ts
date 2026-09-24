import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { AttachmentChip, CourseChatAttachments } from './course-chat-attachments';

function chip(overrides: Partial<AttachmentChip> = {}): AttachmentChip {
  return {
    key: 'a1',
    name: 'photo.png',
    kind: 'image',
    size: 2048,
    phase: 'ready',
    progress: 100,
    ...overrides,
  };
}

describe('CourseChatAttachments', () => {
  async function createComponent(
    inputs: Partial<{ items: AttachmentChip[]; editable: boolean; busy: boolean }> = {},
  ): Promise<ComponentFixture<CourseChatAttachments>> {
    await TestBed.configureTestingModule({
      imports: [CourseChatAttachments, provideTranslocoTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChatAttachments);
    fixture.componentRef.setInput('items', inputs.items ?? []);
    fixture.componentRef.setInput('editable', inputs.editable ?? false);
    fixture.componentRef.setInput('busy', inputs.busy ?? false);
    await fixture.whenStable();
    return fixture;
  }

  function html(fixture: ComponentFixture<CourseChatAttachments>): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

  it('renders nothing in the thread when the message has no attachment', async () => {
    const fixture = await createComponent();
    expect(html(fixture)).not.toContain('chat-attachments');
  });

  it('still renders in the composer when empty: it carries the paperclip and the drop zone', async () => {
    const fixture = await createComponent({ editable: true });
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.chat-attachments')).not.toBeNull();
    expect(element.querySelector('.chat-attachments__add')).not.toBeNull();
  });

  it('shows the name and a readable size', async () => {
    const fixture = await createComponent({ items: [chip({ size: 2048 })] });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('photo.png');
    expect(text).toContain('2,0 ko');
  });

  it('never offers removal in the thread', async () => {
    const fixture = await createComponent({ items: [chip()] });
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.chat-attachments__remove'),
    ).toBeNull();
  });

  it('emits the removal asked in the composer', async () => {
    const fixture = await createComponent({ items: [chip()], editable: true });
    const remove = (fixture.nativeElement as HTMLElement).querySelector(
      '.chat-attachments__remove',
    ) as HTMLButtonElement;

    const emitted: string[] = [];
    fixture.componentInstance.remove.subscribe((key) => emitted.push(key));
    remove.click();
    expect(emitted).toEqual(['a1']);
  });

  it('makes the name clickable in the thread only', async () => {
    const fixture = await createComponent({ items: [chip()] });
    const link = (fixture.nativeElement as HTMLElement).querySelector(
      '.chat-attachments__name--link',
    ) as HTMLButtonElement;
    const emitted: string[] = [];
    fixture.componentInstance.open.subscribe((id) => emitted.push(id));
    link.click();
    expect(emitted).toEqual(['a1']);
  });

  it('shows a progress bar while uploading', async () => {
    const fixture = await createComponent({
      items: [chip({ phase: 'uploading', progress: 40 })],
      editable: true,
    });
    const progress = (fixture.nativeElement as HTMLElement).querySelector(
      'progress',
    ) as HTMLProgressElement;
    expect(progress.value).toBe(40);
  });

  it('shows a failure notice when an upload failed', async () => {
    const fixture = await createComponent({ items: [chip({ phase: 'error' })], editable: true });
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.chat-attachments__failed'),
    ).not.toBeNull();
  });

  it('disables adding once the message is full', async () => {
    const items = Array.from({ length: 5 }, (_, index) => chip({ key: `a${index}` }));
    const fixture = await createComponent({ items, editable: true });
    const add = (fixture.nativeElement as HTMLElement).querySelector(
      '.chat-attachments__add',
    ) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
  });

  it('disables adding and removing while a turn runs', async () => {
    const fixture = await createComponent({ items: [chip()], editable: true, busy: true });
    const element = fixture.nativeElement as HTMLElement;
    expect((element.querySelector('.chat-attachments__add') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (element.querySelector('.chat-attachments__remove') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('emits picked files and clears the input so the same file can be re-picked', async () => {
    const fixture = await createComponent({ editable: true });
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    // jsdom n'implémente pas `DataTransfer` : on pose `files` directement.
    const file = new File(['x'], 'note.md', { type: 'text/markdown' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    const emitted: File[][] = [];
    fixture.componentInstance.files.subscribe((files) => emitted.push(files));
    input.dispatchEvent(new Event('change'));

    expect(emitted).toHaveLength(1);
    expect(emitted[0][0].name).toBe('note.md');
    expect(input.value).toBe('');
  });
});
