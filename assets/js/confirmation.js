/* Request confirmation. The ?ref value is only a lookup key: the success state appears after
   the server confirms the enquiry exists (GET /api/enquiries/<ref>), never on format alone.
   URL content reaches the page exclusively through textContent. */
(function () {
  'use strict';

  var root = document.querySelector('[data-confirmation]');
  if (!root) return;

  var REF_PATTERN = /^[A-F0-9]{12}$/;
  var REF_GROUP_SIZE = 4;
  var VERIFY_TIMEOUT_MS = 8000;
  var COPY_RESET_MS = 2400;

  var panels = Array.prototype.slice.call(root.querySelectorAll('[data-state]'));
  var announcer = root.querySelector('[data-announcer]');
  var reference = '';
  var copyResetTimer = null;

  var L = function (fa, en) { return window.ofogh && window.ofogh.lang() === 'en' ? en : fa; };
  var STATE_MESSAGES = {
    verified: function () { return L('درخواست شما دریافت شد.', 'Your request has been received.'); },
    unverified: function () { return L('وضعیت درخواست در حال حاضر قابل تأیید نیست.', 'The status of the request cannot be confirmed right now.'); },
    'not-found': function () { return L('شماره پیگیری یافت نشد.', 'Tracking reference not found.'); },
    unavailable: function () { return L('شماره پیگیری در دسترس نیست.', 'No tracking reference available.'); }
  };

  function track(name) {
    document.dispatchEvent(new CustomEvent('go:track', { detail: { event: name } }));
  }

  // Re-setting identical text is not re-announced by every screen reader, so clear first.
  function announce(message) {
    if (!announcer) return;
    announcer.textContent = '';
    window.setTimeout(function () { announcer.textContent = message; }, 60);
  }

  function readReference() {
    var raw = new URLSearchParams(window.location.search).get('ref');
    if (raw === null) return '';
    var normalized = raw.trim().toUpperCase();
    return REF_PATTERN.test(normalized) ? normalized : '';
  }

  function show(state, moveFocus) {
    panels.forEach(function (panel) { panel.hidden = panel.getAttribute('data-state') !== state; });
    root.setAttribute('data-status', state);
    if (STATE_MESSAGES[state]) announce(STATE_MESSAGES[state]());
    if (!moveFocus) return;
    var heading = root.querySelector('[data-state="' + state + '"] h1');
    if (heading) heading.focus();
  }

  function renderReference(value) {
    root.querySelectorAll('[data-ref-value]').forEach(function (target) {
      target.textContent = '';
      for (var i = 0; i < value.length; i += REF_GROUP_SIZE) {
        var group = document.createElement('span');
        group.className = 'ref-group';
        group.textContent = value.slice(i, i + REF_GROUP_SIZE);
        target.appendChild(group);
      }
    });
  }

  function verify(value) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, VERIFY_TIMEOUT_MS) : null;
    return fetch('/api/enquiries/' + encodeURIComponent(value), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('Verification service unavailable');
      return response.json();
    }).then(function (data) {
      if (!data || typeof data.exists !== 'boolean') throw new Error('Unexpected verification response');
      return data.exists ? 'verified' : 'not-found';
    }).catch(function () {
      // Unreachable or static hosting: keep the number visible but make no claim about it.
      return 'unverified';
    }).then(function (state) {
      if (timer) window.clearTimeout(timer);
      return state;
    });
  }

  // lead_submitted fires on the form; this records the view once per reference per session.
  function recordView() {
    var key = 'go:confirmation-viewed:' + reference;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch (error) {
      // Storage unavailable (private mode): a reload may repeat the view event.
    }
    track('confirmation_viewed');
  }

  function run(moveFocus) {
    show('checking');
    verify(reference).then(function (state) {
      show(state, moveFocus);
      if (state === 'verified') recordView();
    });
  }

  function legacyCopy(text) {
    var previousFocus = document.activeElement;
    var buffer = document.createElement('textarea');
    buffer.value = text;
    buffer.setAttribute('readonly', '');
    buffer.setAttribute('aria-hidden', 'true');
    buffer.className = 'copy-buffer';
    document.body.appendChild(buffer);
    buffer.select();
    buffer.setSelectionRange(0, text.length);
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    buffer.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    return copied;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!legacyCopy(text)) throw new Error('Copy failed');
      });
    }
    return legacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
  }

  function setCopyStatus(button, status) {
    button.setAttribute('data-copy-status', status);
    window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(function () { button.setAttribute('data-copy-status', 'idle'); }, COPY_RESET_MS);
  }

  // When copying is blocked, select the code so the visitor can copy it by hand.
  function selectReference(button) {
    var card = button.closest('.ref-card');
    var code = card && card.querySelector('[data-ref-value]');
    var selection = window.getSelection ? window.getSelection() : null;
    if (!code || !selection) return;
    var range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function handleCopy(button) {
    if (!reference) return;
    copyText(reference).then(function () {
      setCopyStatus(button, 'done');
      announce(L('شماره پیگیری کپی شد.', 'Tracking reference copied.'));
      track('reference_copied');
    }, function () {
      setCopyStatus(button, 'failed');
      selectReference(button);
      announce(L('کپی خودکار انجام نشد؛ شماره پیگیری انتخاب شد تا آن را دستی کپی کنید.', 'Automatic copy failed; the reference is selected so you can copy it by hand.'));
    });
  }

  root.addEventListener('click', function (event) {
    var copyButton = event.target.closest('[data-copy]');
    if (copyButton) { handleCopy(copyButton); return; }
    if (event.target.closest('[data-retry]')) run(true);
  });

  reference = readReference();
  if (!reference) { show('unavailable'); return; }
  renderReference(reference);
  run(false);
})();
