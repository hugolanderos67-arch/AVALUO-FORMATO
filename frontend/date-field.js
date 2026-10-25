// Campos de fecha que siempre se ven como dd/mm/aaaa, sin depender del idioma del navegador
// (un Chrome en inglés mostraría mm/dd/aaaa en un <input type="date">).
// Cada <input type="date"> se conserva, oculto, y sigue guardando el valor como aaaa-mm-dd, así que el resto del
// sistema no cambia; a la vista queda un campo de texto dd/mm/aaaa con un botón que abre el calendario.
(function (root) {
  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const valueProperty = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const nativeValue = input => valueProperty.get.call(input);

  function isoToDisplay(iso) {
    const match = ISO.exec(iso || '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  }

  // Acepta d/m/aaaa, dd-mm-aa o dd.mm.aaaa; devuelve aaaa-mm-dd, '' si está vacío, o null si no es una fecha real.
  function displayToIso(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(value);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Fecha y hora guardadas (ISO o 'aaaa-mm-dd hh:mm:ss' de SQLite, en UTC) → 'dd/mm/aaaa hh:mm' en hora local.
  function formatDateTime(value) {
    const text = String(value || '');
    const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
    if (Number.isNaN(date.getTime())) return text;
    const two = number => String(number).padStart(2, '0');
    return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
  }

  function injectStyles() {
    if (document.getElementById('date-field-styles')) return;
    const style = document.createElement('style');
    style.id = 'date-field-styles';
    style.textContent = `
      .date-field { position: relative; display: block; }
      .date-field > input.date-field-text { width: 100%; box-sizing: border-box; padding-right: 38px; }
      .date-field > .date-field-button {
        position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
        padding: 4px 6px; margin: 0; border: none; border-radius: 6px; background: transparent; box-shadow: none;
        color: inherit; font-size: 0.95rem; line-height: 1; cursor: pointer;
      }
      .date-field > .date-field-button:hover, .date-field > .date-field-button:focus-visible { background: rgba(15, 76, 129, 0.1); }
      .date-field > input.date-field-native {
        position: absolute; left: 0; bottom: 0; width: 100%; height: 1px; padding: 0; margin: 0;
        border: 0; opacity: 0; pointer-events: none;
      }`;
    document.head.appendChild(style);
  }

  function enhance(input) {
    if (input.dataset.dateField) return;
    input.dataset.dateField = 'listo';
    injectStyles();

    const wrapper = document.createElement('span');
    wrapper.className = 'date-field';
    const text = Object.assign(document.createElement('input'), {
      type: 'text', inputMode: 'numeric', placeholder: 'dd/mm/aaaa', autocomplete: 'off', maxLength: 10, className: 'date-field-text'
    });
    if (input.title) text.title = input.title;
    if (input.id) {
      // Una etiqueta <label for> apunta ahora al campo visible.
      text.id = input.id;
      input.removeAttribute('id');
    }
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'date-field-button', textContent: '📅' });
    button.setAttribute('aria-label', 'Abrir calendario');
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(text, button, input);
    input.classList.add('date-field-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    const sync = () => {
      text.value = isoToDisplay(nativeValue(input));
      text.setCustomValidity('');
    };
    // Lo que el sistema asigne por código (abrir un avalúo, traer un comparable) también se ve en dd/mm/aaaa.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return nativeValue(this); },
      set(value) { valueProperty.set.call(this, value); sync(); }
    });

    const commit = () => {
      const iso = displayToIso(text.value);
      if (iso === null) {
        text.setCustomValidity('Escriba la fecha como dd/mm/aaaa, por ejemplo 15/10/2026.');
        text.reportValidity();
        return;
      }
      text.setCustomValidity('');
      if (iso !== nativeValue(input)) {
        valueProperty.set.call(input, iso);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      text.value = isoToDisplay(iso);
    };
    text.addEventListener('change', commit);
    text.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      }
    });
    // Agrega las diagonales al escribir (15 → 15/, 15/10 → 15/10/) y no deja dobles si la persona también las escribe.
    text.addEventListener('input', event => {
      if (event.inputType !== 'insertText') return;
      text.value = text.value.replace(/\/{2,}/g, '/');
      if (/^(\d{2}|\d{1,2}\/\d{2})$/.test(text.value)) text.value += '/';
    });
    input.addEventListener('change', sync);
    button.addEventListener('click', () => {
      try {
        input.showPicker();
      } catch {
        text.focus();
      }
    });
    sync();
  }

  function enhanceAll(scope = document) {
    scope.querySelectorAll('input[type="date"]').forEach(enhance);
  }

  enhanceAll();
  // Los campos que se agregan después (tarjetas de comparables, diálogos) se adaptan al aparecer.
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches('input[type="date"]')) enhance(node);
      else enhanceAll(node);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  root.DateField = { enhance, enhanceAll, isoToDisplay, displayToIso, formatDateTime };
})(typeof window !== 'undefined' ? window : globalThis);
