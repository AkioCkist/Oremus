/**
 * "Report" menu items anywhere on the page (posts, comments, profiles, messages) and appeals in Settings.
 * Any element with data-report-type and data-report-id opens the shared dialog; lists re-render freely, so clicks are delegated.
 */
const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';

const dialog = document.querySelector<HTMLDialogElement>('#report-dialog');
const form = dialog?.querySelector<HTMLFormElement>('[data-report-form]') ?? null;
const errorBox = dialog?.querySelector<HTMLElement>('[data-report-error]') ?? null;
let target: { targetType: string; targetId: string } | null = null;

function toast(message: string) {
  document.dispatchEvent(new CustomEvent('oremus:toast', { detail: { message } }));
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message || 'Something went wrong. Try again.');
  return result;
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('[data-report-type]');
  if (!button || !dialog || !form) return;
  const { reportType, reportId } = button.dataset;
  if (!reportType || !reportId) return;
  button.closest('details')?.removeAttribute('open');
  target = { targetType: reportType, targetId: reportId };
  form.reset();
  errorBox?.classList.add('hidden');
  const title = dialog.querySelector('#report-title');
  if (title) title.textContent = `Report ${button.dataset.reportLabel || 'this'}`;
  dialog.showModal();
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!target) return;
  const data = new FormData(form);
  const save = form.querySelector<HTMLButtonElement>('[data-report-save]');
  if (save) save.disabled = true;
  try {
    await post('/api/reports', { ...target, reason: data.get('reason'), note: data.get('note') });
    dialog?.close();
    toast("Thanks. We'll review this report.");
  } catch (error) {
    if (errorBox) { errorBox.textContent = (error as Error).message; errorBox.classList.remove('hidden'); }
  } finally {
    if (save) save.disabled = false;
  }
});

document.querySelectorAll<HTMLFormElement>('[data-appeal-form]').forEach((appeal) => {
  appeal.addEventListener('submit', async (event) => {
    event.preventDefault();
    const box = appeal.querySelector<HTMLElement>('[data-form-error]');
    try {
      await post(`/api/moderation/cases/${appeal.dataset.appealForm}/appeal`, { message: new FormData(appeal).get('message') });
      appeal.replaceChildren(Object.assign(document.createElement('p'), { className: 'text-15 text-muted', textContent: 'Appeal sent. We will let you know the outcome.' }));
    } catch (error) {
      if (box) { box.textContent = (error as Error).message; box.classList.remove('hidden'); }
    }
  });
});
