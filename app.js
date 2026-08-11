/* ====================================================================
   Junkyard Ledger — public "get an offer for your car" landing page.
   Submits leads straight into junk_cars_infra's OfferRequests sheet via
   the one public action on that backend (submitOfferRequest) — the exact
   same Apps Script project junk_cars_web already talks to, just this one
   unauthenticated action instead of a logged-in session.
   ==================================================================== */

function getApiUrl() { return window.OFFERS_API_URL || ''; }

// Apps Script's redirect to script.googleusercontent.com is unreliable —
// same flaky-redirect behavior documented in GuestHub/junk_cars_web: an
// occasional HTML error page can come back with a normal-looking HTTP
// status, so the JSON parse has to be inside the retry loop, not after it.
function fetchJsonWithRetry(url, options, attempts) {
  attempts = attempts || 3;
  return fetch(url, options)
    .then(function(r) { return r.json(); })
    .catch(function(err) {
      if (attempts <= 1) throw err;
      return new Promise(function(resolve) { setTimeout(resolve, 500); })
        .then(function() { return fetchJsonWithRetry(url, options, attempts - 1); });
    });
}

function submitOfferRequest(data) {
  const apiUrl = getApiUrl();
  if (!apiUrl) return Promise.reject(new Error('Not configured yet.'));
  return fetchJsonWithRetry(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'submitOfferRequest', data: data })
  });
}

function uploadOfferPhoto(fileName, mimeType, base64Data) {
  const apiUrl = getApiUrl();
  if (!apiUrl) return Promise.reject(new Error('Not configured yet.'));
  return fetchJsonWithRetry(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'uploadOfferPhoto', data: { fileName: fileName, mimeType: mimeType, base64Data: base64Data } })
  });
}

/* ------------------------------------------------------------------ */
/* Photo upload — each selected file uploads immediately (same pattern */
/* as GuestHub's room-photo admin upload), so by the time the form is   */
/* submitted every photo is already a Drive URL, not a pending upload.  */
/* ------------------------------------------------------------------ */

const MAX_PHOTOS = 6;
let uploadedPhotoUrls = [];

document.getElementById('photoInput').addEventListener('change', function() {
  const files = Array.prototype.slice.call(this.files);
  const room = MAX_PHOTOS - uploadedPhotoUrls.length;
  if (room <= 0) { this.value = ''; return; }
  files.slice(0, room).forEach(uploadOnePhoto_);
  this.value = ''; // lets the same file be re-picked later if removed
});

function uploadOnePhoto_(file) {
  const thumbs = document.getElementById('photoThumbs');
  const thumb = document.createElement('div');
  thumb.className = 'photo-thumb uploading';
  thumb.textContent = 'Uploading…';
  thumbs.appendChild(thumb);

  const reader = new FileReader();
  reader.onload = function(ev) {
    const base64Data = ev.target.result.split(',')[1];
    uploadOfferPhoto(file.name, file.type || 'image/jpeg', base64Data).then(function(res) {
      if (!res.ok) { thumb.className = 'photo-thumb failed'; thumb.textContent = 'Failed'; return; }
      uploadedPhotoUrls.push(res.url);
      thumb.className = 'photo-thumb';
      thumb.innerHTML = '<img src="' + res.url + '" alt="">' +
        '<button type="button" class="photo-thumb-remove" aria-label="Remove photo">×</button>';
      thumb.querySelector('.photo-thumb-remove').addEventListener('click', function() {
        uploadedPhotoUrls = uploadedPhotoUrls.filter(function(u) { return u !== res.url; });
        thumb.remove();
      });
    }).catch(function() {
      thumb.className = 'photo-thumb failed'; thumb.textContent = 'Failed';
    });
  };
  reader.readAsDataURL(file);
}

function resetPhotos_() {
  uploadedPhotoUrls = [];
  document.getElementById('photoThumbs').innerHTML = '';
}

/* ------------------------------------------------------------------ */
/* VIN auto-decode — free NHTSA vPIC API, no key, CORS-enabled. Plate    */
/* lookup has no free equivalent (needs a paid provider + a state), so   */
/* it's intentionally not attempted — plate stays a manual entry.        */
/* ------------------------------------------------------------------ */

function decodeVin_(vin) {
  return fetch('https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/' + encodeURIComponent(vin) + '?format=json')
    .then(function(r) { return r.json(); })
    .then(function(j) {
      const r = (j && j.Results && j.Results[0]) || {};
      // A failed/undecodable VIN comes back with a non-zero ErrorCode and
      // every field blank — checking for actual data is simpler and more
      // robust than parsing ErrorCode's semicolon-separated text.
      if (!r.Make && !r.Model && !r.ModelYear) return null;
      return { year: r.ModelYear || '', make: r.Make || '', model: r.Model || '' };
    });
}

let vinLookupSeq = 0; // guards against a slow earlier lookup overwriting a newer one
document.getElementById('vin').addEventListener('input', function() {
  const vin = this.value.trim().toUpperCase();
  const status = document.getElementById('vinLookupStatus');
  if (vin.length !== 17) { status.textContent = ''; status.className = 'vin-lookup-status'; return; }

  const seq = ++vinLookupSeq;
  status.textContent = 'Looking up VIN…'; status.className = 'vin-lookup-status';
  decodeVin_(vin).then(function(result) {
    if (seq !== vinLookupSeq) return; // a newer keystroke already started another lookup
    if (!result) {
      status.textContent = 'Couldn\'t find that VIN — enter the details below manually.';
      status.className = 'vin-lookup-status err';
      return;
    }
    document.getElementById('year').value = result.year;
    document.getElementById('make').value = result.make;
    document.getElementById('model').value = result.model;
    status.textContent = 'Found: ' + [result.year, result.make, result.model].filter(Boolean).join(' ');
    status.className = 'vin-lookup-status ok';
  }).catch(function() {
    if (seq !== vinLookupSeq) return;
    status.textContent = 'Couldn\'t look that up — enter the details below manually.';
    status.className = 'vin-lookup-status err';
  });
});

/* VIN / plate toggle */
let idType = 'vin';
document.querySelectorAll('.id-toggle-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    idType = btn.dataset.idType;
    document.querySelectorAll('.id-toggle-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
    document.getElementById('vinField').hidden = idType !== 'vin';
    document.getElementById('plateField').hidden = idType !== 'plate';
  });
});

document.getElementById('offerForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('formStatus');

  const vin = document.getElementById('vin').value.trim();
  const plate = document.getElementById('plate').value.trim();
  if (idType === 'vin' && !vin) { status.textContent = 'Enter your VIN, or switch to License Plate.'; status.className = 'form-status err'; return; }
  if (idType === 'plate' && !plate) { status.textContent = 'Enter your license plate, or switch to VIN.'; status.className = 'form-status err'; return; }

  btn.disabled = true;
  status.textContent = 'Sending…'; status.className = 'form-status';

  submitOfferRequest({
    vin: idType === 'vin' ? vin : '',
    plate: idType === 'plate' ? plate : '',
    year: document.getElementById('year').value.trim(),
    make: document.getElementById('make').value.trim(),
    model: document.getElementById('model').value.trim(),
    condition: document.getElementById('condition').value,
    location: document.getElementById('location').value.trim(),
    contactName: document.getElementById('contactName').value.trim(),
    contactEmail: document.getElementById('contactEmail').value.trim(),
    contactPhone: document.getElementById('contactPhone').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    photoUrls: uploadedPhotoUrls.join(',')
  }).then(function(res) {
    btn.disabled = false;
    if (!res.ok) { status.textContent = res.error || 'Could not send your request.'; status.className = 'form-status err'; return; }
    status.textContent = '';
    document.getElementById('confirmText').textContent =
      'Thanks — we\'ve got your request (' + res.id + '). We\'ll email you an offer soon.';
    document.getElementById('confirmOverlay').hidden = false;
    document.getElementById('offerForm').reset();
    resetPhotos_();
    document.getElementById('vinField').hidden = false;
    document.getElementById('plateField').hidden = true;
    idType = 'vin';
    document.querySelectorAll('.id-toggle-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.idType === 'vin'); });
  }).catch(function(err) {
    btn.disabled = false;
    status.textContent = String(err.message || err); status.className = 'form-status err';
  });
});

document.getElementById('confirmCloseBtn').addEventListener('click', function() {
  document.getElementById('confirmOverlay').hidden = true;
});
document.getElementById('confirmOverlay').addEventListener('click', function(e) {
  if (e.target === this) this.hidden = true;
});
