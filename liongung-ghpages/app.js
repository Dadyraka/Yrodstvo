(function() {
  'use strict';

  // ------- State management -------
  const STORAGE_KEYS = {
    balance: 'liongung_balance_usd',
    txs: 'liongung_transactions',
    cards: 'liongung_cards',
  };

  function loadNumber(key, fallback = 0) {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  function saveNumber(key, value) {
    localStorage.setItem(key, String(value));
  }
  function loadJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  let balance = loadNumber(STORAGE_KEYS.balance, 0);
  let transactions = loadJSON(STORAGE_KEYS.txs, []);
  let cards = loadJSON(STORAGE_KEYS.cards, []);

  // ------- DOM refs -------
  const balanceValueEl = document.getElementById('balanceValue');
  const historyListEl = document.getElementById('historyList');

  const earnBtn = document.getElementById('earnBtn');
  const sendBtn = document.getElementById('sendBtn');
  const receiveBtn = document.getElementById('receiveBtn');
  const cardsBtn = document.getElementById('cardsBtn');
  const resetDataBtn = document.getElementById('resetDataBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const earnModal = document.getElementById('earnModal');
  const sendModal = document.getElementById('sendModal');
  const receiveModal = document.getElementById('receiveModal');
  const cardsModal = document.getElementById('cardsModal');

  const earnRandomBtn = document.getElementById('earnRandomBtn');

  const sendForm = document.getElementById('sendForm');
  const sendRecipient = document.getElementById('sendRecipient');
  const sendAmount = document.getElementById('sendAmount');
  const sendNote = document.getElementById('sendNote');
  const sendError = document.getElementById('sendError');

  const requestAmount = document.getElementById('requestAmount');
  const requestNote = document.getElementById('requestNote');
  const makePayLinkBtn = document.getElementById('makePayLinkBtn');
  const copyRequisitesBtn = document.getElementById('copyRequisitesBtn');
  const payLinkOut = document.getElementById('payLinkOut');

  const issueCardBtn = document.getElementById('issueCardBtn');
  const cardsList = document.getElementById('cardsList');

  // ------- Utils -------
  const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  function formatUsd(x) { return USD.format(x); }
  function nowIso() { return new Date().toISOString(); }
  function uid() { return Math.random().toString(36).slice(2, 10); }

  function openModal(modal) {
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal(modal) {
    modal.setAttribute('aria-hidden', 'true');
  }
  function closeAllModals() {
    [earnModal, sendModal, receiveModal, cardsModal].forEach(m => m && closeModal(m));
  }

  function addTx(tx) {
    transactions.unshift(tx);
    saveJSON(STORAGE_KEYS.txs, transactions);
    renderHistory();
  }

  function setBalance(newBalance) {
    balance = Math.max(0, Number(newBalance.toFixed(2)));
    saveNumber(STORAGE_KEYS.balance, balance);
    renderBalance();
  }

  function renderBalance() {
    balanceValueEl.textContent = formatUsd(balance);
  }

  function renderHistory() {
    historyListEl.innerHTML = '';
    const list = transactions.slice(0, 20);
    if (list.length === 0) {
      const li = document.createElement('li');
      li.className = 'history__item';
      li.innerHTML = '<span class="history__meta">Нет операций</span><span></span>';
      historyListEl.appendChild(li);
      return;
    }
    list.forEach(tx => {
      const li = document.createElement('li');
      li.className = 'history__item';
      const title = document.createElement('div');
      title.className = 'history__title';
      title.textContent = tx.title;
      const meta = document.createElement('div');
      meta.className = 'history__meta';
      const date = new Date(tx.date).toLocaleString();
      meta.textContent = [date, tx.note].filter(Boolean).join(' • ');
      const left = document.createElement('div');
      left.appendChild(title); left.appendChild(meta);

      const amount = document.createElement('div');
      const sign = tx.type === 'in' ? '+' : '-';
      amount.className = 'history__amount ' + (tx.type === 'in' ? 'history__amount--in' : 'history__amount--out');
      amount.textContent = sign + formatUsd(tx.amount);

      li.appendChild(left);
      li.appendChild(amount);
      historyListEl.appendChild(li);
    });
  }

  function copyText(text) {
    navigator.clipboard?.writeText(text).catch(() => {
      // Ignore errors in environments without clipboard permission
    });
  }

  function currentOrigin() {
    try { return window.location.origin; } catch { return ''; }
  }

  // Card generation helpers
  function luhnChecksum(numberSansCheck) {
    let sum = 0;
    const reversed = numberSansCheck.split('').reverse().map(d => parseInt(d, 10));
    for (let i = 0; i < reversed.length; i++) {
      let digit = reversed[i];
      if (i % 2 === 0) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    const check = (10 - (sum % 10)) % 10;
    return check;
  }
  function generateCardNumber(brand) {
    // lengths: Visa 16 starting 4; UnionPay 16-19 starting 62. We'll use 16.
    let start = brand === 'unionpay' ? '62' : '4';
    const bodyLen = 15 - start.length; // 15 digits before check
    let body = '';
    for (let i = 0; i < bodyLen; i++) body += Math.floor(Math.random() * 10);
    const partial = start + body;
    const check = luhnChecksum(partial);
    return partial + String(check);
  }
  function maskCardNumber(num) {
    return num.replace(/\d(?=\d{4})/g, '*').replace(/(.{4})/g, '$1 ').trim();
  }
  function randomExpiry() {
    const now = new Date();
    const y = now.getFullYear() + Math.floor(Math.random() * 4 + 2); // 2..5 years ahead
    const m = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    return `${m}/${String(y).slice(-2)}`;
  }
  function randomCvv() { return String(Math.floor(Math.random() * 1000)).padStart(3, '0'); }

  function renderCards() {
    cardsList.innerHTML = '';
    if (cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Нет выпущенных карт';
      cardsList.appendChild(empty);
      return;
    }
    cards.forEach(card => {
      const el = document.createElement('div');
      el.className = 'card-item';
      const brandLabel = card.brand === 'unionpay' ? 'UnionPay' : 'Visa';
      el.innerHTML = `
        <div class="card-item__row">
          <div class="card-item__brand">${brandLabel}</div>
          <div class="card-item__meta">${card.frozen ? 'Заблокирована' : 'Активна'}</div>
        </div>
        <div class="card-item__row" style="margin-top:6px">
          <div class="card-item__num">${maskCardNumber(card.number)}</div>
          <div class="card-item__meta">EXP ${card.expiry} • CVV <span data-cvv="${card.id}">•••</span></div>
        </div>
        <div class="card-item__actions">
          <button class="btn btn--ghost" data-action="toggle-cvv" data-id="${card.id}">Показать CVV</button>
          <button class="btn btn--ghost" data-action="copy-pan" data-id="${card.id}">Копировать номер</button>
          <button class="btn btn--ghost" data-action="freeze" data-id="${card.id}">${card.frozen ? 'Разморозить' : 'Заморозить'}</button>
          <button class="btn btn--ghost" data-action="delete" data-id="${card.id}">Удалить</button>
        </div>
      `;
      cardsList.appendChild(el);
    });
  }

  function saveCards() { saveJSON(STORAGE_KEYS.cards, cards); }

  // ------- Event wiring -------
  document.body.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal');
      if (modal) closeModal(modal);
    }

    const earnPick = e.target.closest('[data-earn]');
    if (earnPick) {
      const amount = Number(earnPick.getAttribute('data-earn'));
      setBalance(balance + amount);
      addTx({ id: uid(), type: 'in', amount, title: 'Зачисление', date: nowIso(), note: `Earn +$${amount}` });
      closeModal(earnModal);
    }

    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const sel = copyBtn.getAttribute('data-copy');
      const el = document.querySelector(sel);
      if (el) copyText(el.textContent || '');
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const id = actionBtn.getAttribute('data-id');
      const action = actionBtn.getAttribute('data-action');
      const idx = cards.findIndex(c => c.id === id);
      if (idx !== -1) {
        const card = cards[idx];
        if (action === 'toggle-cvv') {
          const span = document.querySelector(`[data-cvv="${id}"]`);
          if (span) {
            if (span.textContent === '•••') span.textContent = card.cvv; else span.textContent = '•••';
          }
        } else if (action === 'copy-pan') {
          copyText(card.number);
        } else if (action === 'freeze') {
          card.frozen = !card.frozen;
          cards[idx] = card; saveCards(); renderCards();
        } else if (action === 'delete') {
          cards.splice(idx, 1); saveCards(); renderCards();
        }
      }
    }
  });

  earnBtn.addEventListener('click', () => openModal(earnModal));
  sendBtn.addEventListener('click', () => {
    sendForm.reset();
    sendError.textContent = '';
    openModal(sendModal);
  });
  receiveBtn.addEventListener('click', () => openModal(receiveModal));
  cardsBtn.addEventListener('click', () => { renderCards(); openModal(cardsModal); });

  earnRandomBtn.addEventListener('click', () => {
    const amount = Math.random() < 0.5 ? 50 : 150;
    setBalance(balance + amount);
    addTx({ id: uid(), type: 'in', amount, title: 'Зачисление', date: nowIso(), note: 'Earn (случайно)' });
    closeModal(earnModal);
  });

  sendForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendError.textContent = '';
    const recipient = String(sendRecipient.value || '').trim();
    const amount = Number(sendAmount.value);
    const note = String(sendNote.value || '').trim();

    if (!recipient) { sendError.textContent = 'Укажите получателя'; return; }
    if (!Number.isFinite(amount) || amount <= 0) { sendError.textContent = 'Некорректная сумма'; return; }
    if (amount > balance) { sendError.textContent = 'Недостаточно средств'; return; }

    setBalance(balance - amount);
    addTx({ id: uid(), type: 'out', amount, title: `Перевод: ${recipient}` , date: nowIso(), note });

    closeModal(sendModal);
  });

  makePayLinkBtn.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (requestAmount.value) params.set('req_amount', String(Number(requestAmount.value)));
    if (requestNote.value) params.set('req_note', requestNote.value);
    const url = `${currentOrigin()}${window.location.pathname}?${params.toString()}`;
    payLinkOut.textContent = url;
    copyText(url);
  });

  copyRequisitesBtn.addEventListener('click', () => {
    const bank = 'Liongung Bank';
    const name = document.getElementById('rqName').textContent;
    const swift = document.getElementById('rqSwift').textContent;
    const routing = document.getElementById('rqRouting').textContent;
    const account = document.getElementById('rqAccount').textContent;
    const text = `Bank: ${bank}\nName: ${name}\nSWIFT: ${swift}\nRouting: ${routing}\nAccount: ${account}\nCurrency: USD`;
    copyText(text);
  });

  issueCardBtn.addEventListener('click', () => {
    const brand = document.querySelector('input[name="brand"]:checked').value;
    const number = generateCardNumber(brand);
    const expiry = randomExpiry();
    const cvv = randomCvv();
    const card = { id: uid(), brand, number, expiry, cvv, frozen: false };
    cards.unshift(card); saveCards(); renderCards();
  });

  clearHistoryBtn.addEventListener('click', () => {
    transactions = []; saveJSON(STORAGE_KEYS.txs, transactions); renderHistory();
  });

  resetDataBtn.addEventListener('click', () => {
    if (!confirm('Сбросить баланс, историю и карты?')) return;
    balance = 0; transactions = []; cards = [];
    saveNumber(STORAGE_KEYS.balance, balance);
    saveJSON(STORAGE_KEYS.txs, transactions);
    saveJSON(STORAGE_KEYS.cards, cards);
    renderBalance(); renderHistory(); renderCards();
  });

  // ------- Load payment request if any -------
  (function applyRequestFromUrl() {
    const url = new URL(window.location.href);
    const amt = url.searchParams.get('req_amount');
    const note = url.searchParams.get('req_note');
    if (amt || note) {
      openModal(sendModal);
      if (amt) sendAmount.value = amt;
      if (note) sendNote.value = note;
    }
  })();

  // ------- Initial render -------
  renderBalance();
  renderHistory();
  // cards render lazily on open
})();