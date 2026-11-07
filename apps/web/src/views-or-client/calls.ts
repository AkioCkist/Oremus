/**
 * Voice and video calls. The server decides what state a call is in and says so over the socket; this file shows it.
 * Ringing happens with no LiveKit involved, and livekit.js only loads once a call has actually been answered.
 */
type Person = { id: string; displayName: string; username: string; avatarUrl: string };
type Join = { callId: string; kind: 'audio' | 'video'; url: string; token: string };
type Socket = { on: (event: string, callback: (payload: any) => void) => void };
type LiveKit = typeof import('livekit-client');

const csrf = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content || '';
const dialog = document.querySelector<HTMLDialogElement>('#call-dialog');
const part = <T extends Element = HTMLElement>(name: string) => dialog?.querySelector<T>(`[data-call-${name}]`) ?? null;

const toast = (message: string) => document.dispatchEvent(new CustomEvent('oremus:toast', { detail: { message } }));

async function api(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrf, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || 'Something went wrong. Try again.');
  return payload.data;
}

/* ---------- Ringtone: two short tones, generated so there is no audio file to fetch or be blocked. ---------- */

let ringTimer = 0;
let audioContext: AudioContext | null = null;

function beep(frequency: number, at: number) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.15, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(at); oscillator.stop(at + 0.42);
}

function startRinging(incoming: boolean) {
  stopRinging();
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const ring = () => {
      const now = audioContext!.currentTime;
      beep(incoming ? 880 : 440, now);
      beep(incoming ? 660 : 440, now + 0.45);
    };
    ring();
    ringTimer = window.setInterval(ring, incoming ? 2000 : 3000);
  } catch { /* A silent ring is still a ring: the dialog is on screen. */ }
}

function stopRinging() { window.clearInterval(ringTimer); ringTimer = 0; }

/* ---------- State ---------- */

type View = 'incoming' | 'outgoing' | 'connecting' | 'active';
let callId = '';
let kind: 'audio' | 'video' = 'audio';
let room: any = null;
let timer = 0;
let answeredAt = 0;

// A class rather than the hidden attribute: these elements have display utilities that would override it.
const setHidden = (element: Element | null, hidden: boolean) => element?.classList.toggle('hidden', hidden);

function setPerson(person: Person) {
  const name = part('name'); if (name) name.textContent = person.displayName;
  const photo = part<HTMLImageElement>('photo');
  const initials = part('initials');
  setHidden(photo, !person.avatarUrl);
  if (photo && person.avatarUrl) photo.src = person.avatarUrl;
  setHidden(initials, !!person.avatarUrl);
  if (initials) initials.textContent = person.displayName.split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase();
}

function setStatus(text: string) { const status = part('status'); if (status) status.textContent = text; }

function show(view: View, person?: Person) {
  if (!dialog) return;
  if (person) setPerson(person);
  dialog.dataset.callView = view;
  dialog.dataset.callKind = kind;
  setHidden(part('incoming-controls'), view !== 'incoming');
  setHidden(part('live-controls'), view === 'incoming');
  setHidden(part('camera'), kind !== 'video' || view === 'outgoing');
  setHidden(part('flip'), kind !== 'video' || view === 'outgoing');
  setHidden(part('mic'), view === 'outgoing');
  const words: Record<View, string> = { incoming: kind === 'video' ? 'Incoming video call' : 'Incoming voice call', outgoing: 'Ringing…', connecting: 'Connecting…', active: '' };
  if (view !== 'active') setStatus(words[view]);
  if (!dialog.open) dialog.showModal();
}

function reset() {
  stopRinging();
  window.clearInterval(timer); timer = 0; answeredAt = 0;
  const ending = room; room = null;
  ending?.disconnect?.();
  dialog?.querySelectorAll('video, audio').forEach((media) => { (media as HTMLMediaElement).srcObject = null; });
  part<HTMLVideoElement>('remote')?.classList.add('hidden');
  part<HTMLVideoElement>('local')?.classList.add('hidden');
  part('avatar')?.classList.remove('hidden');
  part('audio-unlock')?.classList.add('hidden');
  callId = '';
  if (dialog?.open) dialog.close();
}

function tickDuration() {
  const seconds = Math.floor((Date.now() - answeredAt) / 1000);
  setStatus(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
}

const QUALITY_WORDS: Record<string, string> = { poor: 'Weak connection', lost: 'Connection lost' };

/* ---------- Media ---------- */

function loadLiveKit(): Promise<LiveKit> {
  // Same version as this script, so a deploy can't pair old code with a new bundle.
  const version = new URL(import.meta.url).search;
  return import(/* @vite-ignore */ `/assets/livekit.js${version}`);
}

function mediaError(error: any): string {
  if (error?.name === 'NotAllowedError') return 'Oremus needs permission to use your microphone or camera. Allow it in your browser and try again.';
  if (error?.name === 'NotFoundError') return 'No microphone or camera was found on this device.';
  if (error?.name === 'NotReadableError') return 'Your microphone or camera is being used by another app or tab. Close it and try again.';
  return 'The call could not connect. Check your connection and try again.';
}

async function connect(join: Join) {
  callId = join.callId; kind = join.kind;
  stopRinging();
  show('connecting');
  try {
    const { Room, RoomEvent, Track } = await loadLiveKit();
    const current = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    room = current;
    const remote = part<HTMLVideoElement>('remote'), local = part<HTMLVideoElement>('local'), sound = part<HTMLAudioElement>('sound');

    current.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && remote) {
        track.attach(remote);
        remote.classList.remove('hidden');
        part('avatar')?.classList.add('hidden');
      } else if (track.kind === Track.Kind.Audio && sound) track.attach(sound);
    });
    current.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
      if (track.kind === Track.Kind.Video) { remote?.classList.add('hidden'); part('avatar')?.classList.remove('hidden'); }
    });
    current.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.track?.kind === Track.Kind.Video && local) { publication.track.attach(local); local.classList.remove('hidden'); }
    });
    current.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.track?.kind === Track.Kind.Video) local?.classList.add('hidden');
    });
    current.on(RoomEvent.ParticipantConnected, () => markLive());
    current.on(RoomEvent.Reconnecting, () => setNotice('Reconnecting…'));
    current.on(RoomEvent.Reconnected, () => setNotice(''));
    current.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => { if (participant.isLocal) setNotice(QUALITY_WORDS[String(quality)] || ''); });
    current.on(RoomEvent.AudioPlaybackStatusChanged, () => part('audio-unlock')?.classList.toggle('hidden', current.canPlaybackAudio));
    current.on(RoomEvent.Disconnected, () => { if (callId && room === current) hangUp(); });

    await current.connect(join.url, join.token);
    await current.localParticipant.setMicrophoneEnabled(true);
    if (join.kind === 'video') {
      // A camera that fails (busy, blocked) should not end a call that already has sound.
      try { await current.localParticipant.setCameraEnabled(true); }
      catch (error) { console.error('[calls] camera failed', error); setNotice(mediaError(error).replace('microphone or camera', 'camera')); }
    }
    if (current.remoteParticipants.size > 0) markLive();
    else setStatus('Waiting for them to join…');
  } catch (error) {
    console.error('[calls] connect failed', error);
    toast(mediaError(error));
    hangUp();
  }
}

function setNotice(text: string) { const notice = part('notice'); if (notice) notice.textContent = text; setHidden(notice, !text); }

function markLive() {
  if (answeredAt) return;
  answeredAt = Date.now();
  show('active');
  tickDuration();
  timer = window.setInterval(tickDuration, 1000);
}

function hangUp() {
  const id = callId;
  reset();
  if (id) api(`/api/calls/${id}/end`, {}).catch(() => undefined);
}

/* ---------- Starting and answering ---------- */

async function startOutgoing(conversationId: string, callKind: 'audio' | 'video') {
  if (callId) return;
  try {
    kind = callKind;
    const call = await api('/api/calls', { conversationId, kind: callKind });
    callId = call.callId;
    show('outgoing', call.person);
    startRinging(false);
  } catch (error) { toast((error as Error).message); }
}

function showIncoming(call: { callId: string; kind: 'audio' | 'video'; person: Person }) {
  if (callId) return;
  callId = call.callId; kind = call.kind;
  show('incoming', call.person);
  startRinging(true);
}

document.addEventListener('click', async (event) => {
  const target = event.target as Element;
  const start = target.closest<HTMLElement>('[data-call-start]');
  if (start?.dataset.callStart) { await startOutgoing(start.dataset.callStart, start.dataset.callType === 'video' ? 'video' : 'audio'); return; }
  if (!dialog?.contains(target)) return;

  if (target.closest('[data-call-accept]')) {
    try { await connect(await api(`/api/calls/${callId}/accept`, {})); }
    catch (error) { toast((error as Error).message); reset(); }
    return;
  }
  if (target.closest('[data-call-decline]')) {
    const id = callId; reset();
    api(`/api/calls/${id}/decline`, {}).catch(() => undefined);
    return;
  }
  if (target.closest('[data-call-end]')) { hangUp(); return; }
  if (target.closest('[data-call-audio-unlock]')) { await room?.startAudio?.(); return; }

  const mic = target.closest<HTMLElement>('[data-call-mic]');
  if (mic && room) {
    const enabled = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    mic.setAttribute('aria-pressed', String(!enabled));
    mic.setAttribute('aria-label', enabled ? 'Mute' : 'Unmute');
    return;
  }
  const camera = target.closest<HTMLElement>('[data-call-camera]');
  if (camera && room) {
    const enabled = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(enabled);
      camera.setAttribute('aria-pressed', String(!enabled));
      camera.setAttribute('aria-label', enabled ? 'Turn camera off' : 'Turn camera on');
    } catch (error) { toast(mediaError(error)); }
    return;
  }
  if (target.closest('[data-call-flip]') && room) {
    try {
      const { Room } = await loadLiveKit();
      const cameras = await Room.getLocalDevices('videoinput');
      const active = room.getActiveDevice('videoinput');
      const next = cameras[(cameras.findIndex((device) => device.deviceId === active) + 1) % cameras.length];
      if (next) await room.switchActiveDevice('videoinput', next.deviceId);
    } catch (error) { toast(mediaError(error)); }
  }
});

// Esc must not silently leave a live call running with no controls on screen.
dialog?.addEventListener('cancel', (event) => event.preventDefault());

window.addEventListener('beforeunload', (event) => { if (room) event.preventDefault(); });

/* ---------- From the server ---------- */

const ENDED_WORDS: Record<string, string> = { declined: 'Call declined.', missed: 'No answer.', failed: "The call couldn't connect." };

document.addEventListener('oremus:socket', (event) => {
  const socket = (event as CustomEvent<Socket>).detail;
  socket.on('call:incoming', showIncoming);
  socket.on('call:accepted', async ({ callId: id }) => {
    if (id !== callId) return;
    try { await connect(await api(`/api/calls/${id}/join`, {})); }
    catch (error) { toast((error as Error).message); reset(); }
  });
  socket.on('call:answered-elsewhere', ({ callId: id }) => {
    // This tab is the one that answered if it already holds a room.
    if (id === callId && !room) reset();
  });
  socket.on('call:ended', ({ callId: id, status }) => {
    if (id !== callId) return;
    const wasOutgoing = dialog?.dataset.callView === 'outgoing';
    reset();
    if (wasOutgoing && ENDED_WORDS[status]) toast(ENDED_WORDS[status]!);
  });
  // A page opened or reloaded while a call is going on picks it back up.
  socket.on('connect', async () => {
    if (callId) return;
    try {
      const { call } = await api('/api/calls/active');
      if (!call) return;
      if (call.status === 'ringing' && call.incoming) showIncoming(call);
      if (call.status === 'accepted') { setPerson(call.person); await connect(await api(`/api/calls/${call.callId}/join`, {})); }
    } catch { /* Nothing to resume. */ }
  });
});
