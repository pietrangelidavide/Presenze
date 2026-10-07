import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { ImageError, readImage, renderAvatar, type LoadedImage } from '../lib/image';
import { NAME_MAX, fitCrop, zoomAround, type Crop } from '../lib/profile';
import { makePeriod, summarize } from '../lib/stats';
import { dur, durSigned } from '../lib/time';
import { useStore } from '../state';
import { Avatar, Icon, Sheet } from '../ui';
import { Backdrop } from './Auth';

const VIEW = 264; // lato del riquadro di ritaglio, in pixel

export function Profile() {
  const s = useStore();
  const [name, setName] = useState(s.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [picked, setPicked] = useState<LoadedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // se il nome cambia da fuori (primo caricamento) il campo lo segue, finché non lo si tocca
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setName(s.name ?? ''); }, [s.name]);

  const sum = summarize(s.tl, makePeriod('all', s.today, s.tl));
  const bank = s.tl.cum(s.today);
  const shown = s.name || s.email || 'Il tuo profilo';
  const nameChanged = name.trim() !== (s.name ?? '');

  const pick = () => fileRef.current?.click();
  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (fileRef.current) fileRef.current.value = ''; // permette di scegliere di nuovo lo stesso file
    if (!f) return;
    setBusy(true);
    try { setPicked(await readImage(f)); }
    catch (e) { s.toast(e instanceof ImageError ? e.message : 'Non riesco ad aprire questa immagine.', true); }
    finally { setBusy(false); }
  };

  const closeCrop = () => { picked?.close(); setPicked(null); };
  const saveAvatar = async (dataUrl: string) => {
    if (await s.saveProfile({ avatar: dataUrl })) { closeCrop(); s.toast('Foto del profilo aggiornata'); }
  };
  const removeAvatar = async () => { if (await s.saveProfile({ avatar: null })) s.toast('Foto rimossa'); };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (savingName || !nameChanged) return;
    setSavingName(true);
    const ok = await s.saveProfile({ name });
    setSavingName(false);
    if (ok) { touched.current = false; s.toast('Nome aggiornato'); }
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Profilo</h1>
          <p className="sub">La tua foto e il tuo nome, sempre visibili nell’app.</p>
        </div>
      </header>

      <section className="card pf-card" aria-label="Il tuo profilo">
        <div className="pf-cover"><Backdrop className="cover-art" align="top" /></div>
        <div className="pf-body">
          <div className="pf-top">
            <div className="pf-avatar">
              <Avatar src={s.avatar} name={s.name} email={s.email} size={112} />
              <button type="button" className="pf-cam" onClick={pick} disabled={busy} aria-label={s.avatar ? 'Cambia la foto del profilo' : 'Aggiungi una foto del profilo'}><Icon name="camera" size={18} /></button>
            </div>
            <div className="pf-who">
              <h2>{shown}</h2>
              {s.name && s.email ? <p className="muted">{s.email}</p> : null}
              <span className="badge plain">{s.kind === 'local' ? 'Account su questo dispositivo' : 'Account sincronizzato'}</span>
            </div>
          </div>
          <dl className="pf-stats">
            <div><dt>Giornate registrate</dt><dd className="num">{sum.daysDone}</dd></div>
            <div><dt>Ore lavorate</dt><dd className="num">{dur(sum.worked)}</dd></div>
            <div><dt>Banca ore</dt><dd className={`num ${bank > 0 ? 'pos' : bank < 0 ? 'neg' : ''}`}>{bank === 0 ? '0h' : durSigned(bank)}</dd></div>
          </dl>
        </div>
      </section>

      <div className="grid2">
        <section className="card" aria-label="Foto">
          <div className="card-head"><div><h2>Foto</h2><p className="card-sub">Si vede in alto, in ogni schermata.</p></div></div>
          <div className="row wrap">
            <button type="button" className="btn primary" onClick={pick} disabled={busy}><Icon name="camera" size={18} /> {busy ? 'Apro la foto…' : s.avatar ? 'Cambia foto' : 'Scegli una foto'}</button>
            {s.avatar ? <button type="button" className="btn" onClick={() => void removeAvatar()}><Icon name="trash" size={18} /> Rimuovi</button> : null}
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Puoi scegliere una foto dalla galleria o scattarne una. Poi la sposti e la ingrandisci come vuoi: viene tenuta una versione piccola e quadrata.</p>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files)} />
        </section>

        <section className="card" aria-label="Nome">
          <div className="card-head"><div><h2>Nome</h2><p className="card-sub">Come ti chiama l’app.</p></div></div>
          <form className="stack" style={{ gap: 12 }} onSubmit={(e) => void saveName(e)}>
            <div className="field">
              <label htmlFor="pf-name">Nome e cognome</label>
              <input id="pf-name" type="text" autoComplete="name" maxLength={NAME_MAX} value={name} onChange={(e) => { touched.current = true; setName(e.target.value); }} />
            </div>
            <div className="row"><button type="submit" className="btn" disabled={savingName || !nameChanged || !name.trim()}>{savingName ? 'Salvo…' : 'Salva nome'}</button></div>
          </form>
        </section>
      </div>

      <section className="card" aria-label="Account">
        <div className="row wrap">
          <span style={{ flex: 1, minWidth: 0 }}>Accesso come <b>{s.email}</b></span>
          <button type="button" className="btn sm" onClick={() => void s.signOut()}><Icon name="logout" size={16} /> Esci</button>
        </div>
      </section>

      {picked ? <Cropper img={picked} onCancel={closeCrop} onSave={saveAvatar} /> : null}
    </div>
  );
}

// ───────────────────────── ritaglio della foto ─────────────────────────
function Cropper({ img, onCancel, onSave }: { img: LoadedImage; onCancel: () => void; onSave: (dataUrl: string) => Promise<void> }) {
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState<Crop>(() => {
    const c = fitCrop(img.width, img.height, VIEW, 1, 0, 0);
    return fitCrop(img.width, img.height, VIEW, 1, (VIEW - c.w) / 2, (VIEW - c.h) / 2);
  });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (c.width !== VIEW * dpr) { c.width = VIEW * dpr; c.height = VIEW * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, VIEW, VIEW);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img.source, crop.ox, crop.oy, crop.w, crop.h);
  }, [img, crop]);

  const move = (dx: number, dy: number, from = crop) => setCrop(fitCrop(img.width, img.height, VIEW, zoom, from.ox + dx, from.oy + dy));
  const changeZoom = (z: number) => {
    const next = Math.min(4, Math.max(1, z));
    setZoom(next);
    setCrop((c) => zoomAround(img.width, img.height, VIEW, c, next));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: crop.ox, oy: crop.oy };
  };
  const dragMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setCrop(fitCrop(img.width, img.height, VIEW, zoom, d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
  };
  const up = () => { drag.current = null; };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 30 : 10;
    const k = e.key;
    if (k === 'ArrowLeft') move(step, 0); else if (k === 'ArrowRight') move(-step, 0);
    else if (k === 'ArrowUp') move(0, step); else if (k === 'ArrowDown') move(0, -step);
    else if (k === '+' || k === '=') changeZoom(zoom + 0.2); else if (k === '-') changeZoom(zoom - 0.2);
    else return;
    e.preventDefault();
  };

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try { await onSave(renderAvatar(img, VIEW, crop)); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Non sono riuscito a preparare la foto.'); }
    finally { setSaving(false); }
  };

  return (
    <Sheet
      title="Sistema la foto"
      onClose={onCancel}
      footer={<>
        <button type="button" className="btn" onClick={onCancel}>Annulla</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvo…' : 'Usa questa foto'}</button>
      </>}
    >
      <div className="stack" style={{ justifyItems: 'center' }}>
        <div
          className="crop" style={{ width: VIEW, height: VIEW }} tabIndex={0} role="group"
          aria-label="Riquadro della foto: trascina per spostarla, frecce per muoverla, più e meno per ingrandirla"
          onPointerDown={down} onPointerMove={dragMove} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        >
          <canvas ref={canvas} style={{ width: VIEW, height: VIEW }} />
          <span className="crop-ring" aria-hidden="true" />
        </div>
        <div className="field" style={{ width: VIEW }}>
          <label htmlFor="crop-zoom">Zoom</label>
          <input id="crop-zoom" type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} />
        </div>
        <p className="muted" style={{ fontSize: 13, textAlign: 'center', maxWidth: VIEW + 40 }}>Trascina la foto per centrare il viso. Dentro il cerchio è ciò che si vedrà.</p>
        {problem ? <p className="err" role="alert">{problem}</p> : null}
      </div>
    </Sheet>
  );
}
