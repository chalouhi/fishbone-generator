// The demo page. Everything happens here, in the browser: the file is read,
// drawn and turned into downloads without any request leaving the page.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const out = $('out'), status = $('status'), dlSvg = $('dl-svg'), dlPdf = $('dl-pdf');
  let current = null; // the drawn document, or null

  function show(text, from) {
    const t0 = performance.now();
    const r = Fishbone.draw(out, text);
    current = r.ok ? r.doc : null;
    dlSvg.disabled = dlPdf.disabled = !r.ok;
    status.textContent = r.ok ? `Drawn from ${from} in ${Math.round(performance.now() - t0)} ms.` : '';
    out.setAttribute('data-state', r.ok ? 'drawn' : 'errors');
  }

  // Drop anywhere on the page, or choose a file.
  const drop = $('drop');
  const readFile = f => f.text().then(t => show(t, f.name));
  document.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  $('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ''; });

  // Paste: draws as soon as the text changes, or with the button.
  const paste = $('paste');
  let timer = null;
  paste.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { if (paste.value.trim()) show(paste.value, 'the pasted text'); }, 250); });
  $('drawpaste').addEventListener('click', () => show(paste.value, 'the pasted text'));

  // The five samples, loaded with the page.
  const box = $('samples');
  (window.FISHBONE_SAMPLES || []).forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sample'; b.textContent = s.label; b.title = s.why;
    b.setAttribute('data-sample', s.file);
    b.addEventListener('click', () => { paste.value = s.text; show(s.text, s.file); });
    box.appendChild(b);
  });

  // Downloads: made here, handed to the browser as a file.
  const fileName = (ext) => (current.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fishbone') + '.' + ext;
  function save(bytes, type, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  dlSvg.addEventListener('click', () => { if (current) save(Fishbone.pictureSVG(current, 1000), 'image/svg+xml', fileName('svg')); });
  dlPdf.addEventListener('click', () => {
    if (!current) return;
    const doc = current; dlPdf.disabled = true; status.textContent = 'Making the PDF…';
    FishbonePDF.build(doc, { PDFLib: window.PDFLib, fontkit: window.fontkit, regular: b64(FISHBONE_FONTS.regular), bold: b64(FISHBONE_FONTS.bold) })
      .then(bytes => { save(bytes, 'application/pdf', fileName('pdf')); status.textContent = 'PDF ready.'; })
      .catch(e => { status.textContent = 'The PDF could not be made: ' + e.message; })
      .then(() => { dlPdf.disabled = !current; });
  });
})();
