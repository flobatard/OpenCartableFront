import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { attachmentMimeOf, ATTACHMENT_MAX_BYTES } from './attachment.model';
import { AssistantAttachmentsService } from './attachments.service';

const COURSE = 'c1';
const BASE = `${environment.apiUrl}/v1/courses/${COURSE}/assistant/attachments`;

describe('AssistantAttachmentsService', () => {
  let service: AssistantAttachmentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssistantAttachmentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Laisse le service enchaîner son étape suivante (chaque temps est un await). */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('uploads in three steps: presign, PUT to S3, confirm', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const done = service.upload(COURSE, file, 'image/png');
    await tick();

    const presign = http.expectOne(BASE);
    expect(presign.request.method).toBe('POST');
    expect(presign.request.body).toEqual({
      original_name: 'photo.png',
      mime: 'image/png',
      size: file.size,
    });
    presign.flush({
      attachment_id: 'a1',
      upload_url: 'https://s3.test/put/a1',
      status: 'pending',
      expires_in: 900,
    });
    await tick();

    // PUT DIRECT vers S3 : hors apiUrl (donc sans Bearer, c'est voulu) et
    // Content-Type strictement le mime déclaré — il est figé dans la signature.
    const put = http.expectOne('https://s3.test/put/a1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.headers.get('Content-Type')).toBe('image/png');
    put.flush('');
    await tick();

    const confirm = http.expectOne(`${BASE}/a1/confirm`);
    expect(confirm.request.method).toBe('POST');
    confirm.flush({
      id: 'a1',
      original_name: 'photo.png',
      mime: 'image/png',
      kind: 'image',
      size: file.size,
      status: 'available',
      created_at: '2026-09-24T10:00:00Z',
    });

    await expect(done).resolves.toMatchObject({ id: 'a1', status: 'available' });
  });

  it('does not confirm when the upload to S3 fails', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const done = service.upload(COURSE, file, 'image/png');
    await tick();

    http.expectOne(BASE).flush({
      attachment_id: 'a1',
      upload_url: 'https://s3.test/put/a1',
      status: 'pending',
      expires_in: 900,
    });
    await tick();
    http.expectOne('https://s3.test/put/a1').error(new ProgressEvent('error'));

    await expect(done).rejects.toBeDefined();
    http.expectNone(`${BASE}/a1/confirm`);
  });

  it('removes an attachment and asks for a download url', async () => {
    const removed = service.remove(COURSE, 'a1');
    const del = http.expectOne(`${BASE}/a1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    await expect(removed).resolves.toBeNull();

    const url = service.downloadUrl(COURSE, 'a1');
    const get = http.expectOne(`${BASE}/a1/download`);
    expect(get.request.method).toBe('GET');
    get.flush({ download_url: 'https://s3.test/get/a1', expires_in: 1800 });
    await expect(url).resolves.toBe('https://s3.test/get/a1');
  });
});

describe('attachmentMimeOf', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });

  it('keeps a whitelisted mime declared by the browser', () => {
    expect(attachmentMimeOf(file('photo.png', 'image/png'))).toBe('image/png');
  });

  it('falls back to the extension when the browser types nothing', () => {
    expect(attachmentMimeOf(file('notes.md', ''))).toBe('text/markdown');
    expect(attachmentMimeOf(file('bareme.docx', ''))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('prefers the extension over a vague text/plain', () => {
    // Le cas le plus courant : un .md ou un .csv typé text/plain par l'OS —
    // deux formats que le back distingue.
    expect(attachmentMimeOf(file('notes.md', 'text/plain'))).toBe('text/markdown');
    expect(attachmentMimeOf(file('notes.csv', 'text/plain'))).toBe('text/csv');
    expect(attachmentMimeOf(file('notes.txt', 'text/plain'))).toBe('text/plain');
  });

  it('rejects a format outside the whitelist', () => {
    expect(attachmentMimeOf(file('archive.zip', 'application/zip'))).toBeNull();
    expect(attachmentMimeOf(file('anim.gif', 'image/gif'))).toBeNull();
  });

  it('mirrors the back caps per family', () => {
    expect(ATTACHMENT_MAX_BYTES.image).toBe(3_500_000);
    expect(ATTACHMENT_MAX_BYTES.pdf).toBe(20 * 1024 * 1024);
  });
});
