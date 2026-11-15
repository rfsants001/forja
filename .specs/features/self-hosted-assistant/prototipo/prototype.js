const formatNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatDelta = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const sample = {
  remada: [
    ['2026-09-22', 42.5], ['2026-09-29', 45], ['2026-10-06', 45], ['2026-10-13', 47.5],
    ['2026-10-20', 47.5], ['2026-10-27', 50], ['2026-11-03', 50], ['2026-11-10', 52.5]
  ],
  supino: [
    ['2026-09-24', 52.5], ['2026-10-01', 55], ['2026-10-08', 55], ['2026-10-15', 57.5],
    ['2026-10-22', 57.5], ['2026-10-29', 60], ['2026-11-05', 57.5], ['2026-11-12', 62.5]
  ]
};
const measure = value => formatNumber.format(value) + ' kg';
const displayDate = date => shortDate.format(new Date(date + 'T12:00:00Z'));
const daysSinceEpoch = date => Date.parse(date + 'T00:00:00Z') / 86400000;
const endDay = daysSinceEpoch('2026-11-14');

const homeChart = document.querySelector('[data-chart]');
const progressChart = homeChart.cloneNode(true);
progressChart.dataset.initial = 'supino';
document.querySelector('#progress-chart').append(progressChart);

function mountChart(root) {
  const exercise = root.querySelector('[data-exercise]');
  const period = root.querySelector('[data-period]');
  const canvas = root.querySelector('[data-plot]');
  const ctx = canvas.getContext('2d');
  const previous = root.querySelector('[data-prev]');
  const next = root.querySelector('[data-next]');
  let records;
  let selected;
  let plotPoints = [];
  exercise.value = root.dataset.initial;

  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!ctx || !width || !height) return;
    const density = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(density, 0, 0, density, 0, 0);
    const style = getComputedStyle(root);
    const color = token => style.getPropertyValue(token).trim();
    const left = 40;
    const top = 12;
    const right = width - 9;
    const bottom = height - 27;
    const values = records.map(record => record[1]);
    const low = Math.floor((Math.min(...values) - 2.5) / 5) * 5;
    const high = Math.ceil((Math.max(...values) + 2.5) / 5) * 5;
    const start = endDay - Number(period.value) * 7 + 1;
    const x = date => left + (daysSinceEpoch(date) - start) / (endDay - start) * (right - left);
    const y = value => bottom - (value - low) / (high - low) * (bottom - top);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let tick = low; tick <= high; tick += 5) {
      const lineY = y(tick);
      ctx.strokeStyle = color('--line');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, lineY);
      ctx.lineTo(right, lineY);
      ctx.stroke();
      ctx.fillStyle = color('--muted');
      ctx.fillText(String(tick) + ' kg', left - 6, lineY);
    }

    plotPoints = records.map(([date, value]) => ({ x: x(date), y: y(value) }));
    const first = plotPoints[0];
    const last = plotPoints.at(-1);
    if (plotPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(first.x, bottom);
      for (const point of plotPoints) ctx.lineTo(point.x, point.y);
      ctx.lineTo(last.x, bottom);
      ctx.closePath();
      ctx.fillStyle = color('--chart-area');
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of plotPoints.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = color('--accent');
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    plotPoints.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === selected ? 4.5 : 2.75, 0, 2 * Math.PI);
      ctx.fillStyle = color(index === selected ? '--text' : '--accent');
      ctx.fill();
      if (index === selected) {
        ctx.strokeStyle = color('--accent');
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    const dates = [0, Math.round((records.length - 1) / 2), records.length - 1];
    ctx.textAlign = 'center';
    ctx.fillStyle = color('--muted');
    for (const index of new Set(dates)) {
      const labelX = Math.min(right - 25, Math.max(left + 12, plotPoints[index].x));
      ctx.fillText(displayDate(records[index][0]), labelX, height - 7);
    }
  }

  function showPoint() {
    const [date, weight] = records[selected];
    root.querySelector('[data-point]').textContent = displayDate(date) + ' · ' + measure(weight);
    previous.setAttribute('aria-disabled', String(selected === 0));
    next.setAttribute('aria-disabled', String(selected === records.length - 1));
    draw();
  }

  function update() {
    const cutoff = endDay - Number(period.value) * 7 + 1;
    records = sample[exercise.value].filter(([date]) => daysSinceEpoch(date) >= cutoff);
    selected = records.length - 1;
    const change = records[selected][1] - records[0][1];
    root.querySelector('[data-latest]').textContent = measure(records[selected][1]);
    root.querySelector('[data-difference]').textContent = formatDelta.format(change) + ' kg no período';
    const table = root.querySelector('[data-series]');
    table.replaceChildren(...records.map(([date, weight]) => {
      const row = document.createElement('tr');
      row.insertCell().textContent = displayDate(date);
      row.insertCell().textContent = measure(weight);
      return row;
    }));
    showPoint();
  }

  exercise.addEventListener('change', update);
  period.addEventListener('change', update);
  previous.addEventListener('click', () => { if (selected > 0) { selected--; showPoint(); } });
  next.addEventListener('click', () => { if (selected < records.length - 1) { selected++; showPoint(); } });
  canvas.addEventListener('click', event => {
    if (!plotPoints.length) return;
    const offset = event.clientX - canvas.getBoundingClientRect().left;
    const distances = plotPoints.map(point => Math.abs(point.x - offset));
    selected = distances.indexOf(Math.min(...distances));
    showPoint();
  });
  new ResizeObserver(draw).observe(canvas);
  update();
  return draw;
}

const renderCharts = [mountChart(homeChart), mountChart(progressChart)];
const screens = [...document.querySelectorAll('section[data-screen]')];
const main = document.querySelector('main');
function navigate(useFocus = true) {
  const route = location.hash.slice(1);
  if (route === main.id) return;
  const screen = screens.find(page => page.id === route) ?? screens[0];
  const navKey = screen.dataset.parent ?? screen.id;
  screens.forEach(page => { page.hidden = page !== screen; });
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === navKey) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.body.dataset.screen = screen.id;
  document.querySelector('#breadcrumb').textContent = screen.dataset.screen;
  document.title = screen.dataset.screen + ' · Forja';
  if (useFocus) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  if (screen.id === 'treino' && !restStarted) {
    restStarted = true;
    restEndsAt = Date.now() + 84000;
    updateRest();
  }
}
window.addEventListener('hashchange', () => navigate());
document.querySelector('#theme').addEventListener('change', event => {
  document.documentElement.dataset.theme = event.currentTarget.value;
  renderCharts.forEach(draw => draw());
});

const historySearch = document.querySelector('#history-search');
const historyRoutine = document.querySelector('#history-routine');
const historyPeriod = document.querySelector('#history-period');
const rangeFields = document.querySelector('#history-range');
const historyStart = document.querySelector('#history-start');
const historyEnd = document.querySelector('#history-end');
const historyError = document.querySelector('#history-error');
const historyDays = [...document.querySelectorAll('.history-day')];
const examplePeriods = {
  current: ['2026-11-09', '2026-11-15', '9 a 15 nov.'],
  previous: ['2026-11-02', '2026-11-08', '2 a 8 nov.']
};

function normalizeSearch(value) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function filterHistory() {
  const custom = historyPeriod.value === 'range';
  const [start, end, caption] = custom
    ? [historyStart.value, historyEnd.value, 'Período selecionado']
    : examplePeriods[historyPeriod.value] ?? ['', '', 'Todo o histórico'];
  const invalid = custom && (!start || !end || start > end);
  rangeFields.hidden = !custom;
  historyError.hidden = !invalid;
  historyError.textContent = invalid ? 'Informe as duas datas com o início antes ou no mesmo dia do fim.' : '';
  historyEnd.setAttribute('aria-invalid', String(invalid));

  const query = normalizeSearch(historySearch.value);
  let count = 0;
  for (const day of historyDays) {
    const date = day.dataset.date;
    const inPeriod = !invalid && (!start || date >= start) && (!end || date <= end);
    let countForDay = 0;
    for (const session of day.querySelectorAll('.history-session')) {
      const { routine, search } = session.dataset;
      const matchesRoutine = !historyRoutine.value || routine === historyRoutine.value;
      const matchesQuery = normalizeSearch(routine + ' ' + search).includes(query);
      session.hidden = !(inPeriod && matchesRoutine && matchesQuery);
      if (!session.hidden) countForDay++;
    }
    day.hidden = countForDay === 0;
    count += countForDay;
  }
  const summary = count === 0 ? 'Nenhum treino encontrado' : count + (count === 1 ? ' treino' : ' treinos');
  document.querySelector('#history-count').textContent = invalid ? '' : caption + ' · ' + summary;
}
historySearch.addEventListener('input', filterHistory);
for (const field of [historyRoutine, historyPeriod, historyStart, historyEnd]) {
  field.addEventListener('change', filterHistory);
}
filterHistory();

const exerciseName = document.querySelector('#active-exercise-name').textContent;
const technique = document.querySelector('#technique');
const techniqueTrigger = document.querySelector('#technique-trigger');
techniqueTrigger.addEventListener('click', () => {
  technique.open = !technique.open;
  if (technique.open) technique.querySelector('summary').focus();
});
technique.addEventListener('toggle', () => {
  techniqueTrigger.setAttribute('aria-expanded', String(technique.open));
});
const videoSearch = new URL('https://www.youtube.com/results');
videoSearch.searchParams.set('search_query', exerciseName + ' execução');
document.querySelector('#exercise-video').href = videoSearch;
const demoFrame = document.querySelector('#demo-frame');
const demoCredit = document.querySelector('#demo-credit');
const demoToggle = document.querySelector('#demo-toggle');
let isFinalPosition = false;
demoToggle.addEventListener('click', () => {
  isFinalPosition = !isFinalPosition;
  const position = isFinalPosition ? 'final' : 'inicial';
  demoFrame.src = isFinalPosition ? 'assets/supino-inclinado-fim.webp' : 'assets/supino-inclinado-inicio.webp';
  demoFrame.alt = exerciseName + ', posição ' + position;
  demoCredit.href = 'https://wger.de/api/v2/exerciseimage/' + (isFinalPosition ? '130/' : '129/');
  demoToggle.textContent = isFinalPosition ? 'Ver posição inicial' : 'Ver posição final';
});

document.querySelector('#routine-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  document.querySelectorAll('[data-routine-name]').forEach(title => { title.textContent = form.elements.routine.value; });
  form.querySelector('[data-status]').textContent = 'Rotina salva nesta demonstração.';
});
document.querySelector('#provider-form').addEventListener('submit', event => {
  event.preventDefault();
  event.currentTarget.querySelector('[data-status]').textContent = 'Conexão simulada com ' + event.currentTarget.elements.model.value + '.';
});

const pairButton = document.querySelector('#pair-button');
const pairing = document.querySelector('#pairing');
const pairForm = document.querySelector('#pair-form');
const previewButton = document.querySelector('#preview-connection');
const pairError = document.querySelector('#pair-error');
function setPairError(input, message) {
  pairError.hidden = !message;
  pairError.textContent = message;
  pairForm.querySelectorAll('input[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'pair-error');
    input.focus();
  }
}
pairButton.addEventListener('click', () => {
  pairing.hidden = !pairing.hidden;
  pairButton.setAttribute('aria-expanded', String(!pairing.hidden));
  if (!pairing.hidden) previewButton.focus();
});
previewButton.addEventListener('click', () => {
  pairForm.hidden = false;
  previewButton.hidden = true;
  pairForm.elements.code.focus();
});
document.querySelector('#cancel-pair').addEventListener('click', () => {
  pairForm.hidden = true;
  previewButton.hidden = false;
  setPairError(null, '');
  pairForm.querySelector('[data-status]').textContent = '';
  previewButton.focus();
});
pairForm.addEventListener('submit', event => {
  event.preventDefault();
  const code = pairForm.elements.code;
  const name = pairForm.elements.device;
  const digits = code.value.replace(/\s/g, '');
  pairForm.querySelector('[data-status]').textContent = '';
  if (digits !== '704291') {
    setPairError(code, 'Digite o código de exemplo que aparece no convite.');
  } else if (!name.value.trim()) {
    setPairError(name, 'Informe um nome para identificar este aparelho.');
  } else {
    setPairError(null, '');
    pairForm.querySelector('[data-status]').textContent = 'Solicitação de ' + name.value.trim() + ' aguardando aprovação. Demonstração.';
  }
});

const reviewButton = document.querySelector('#review-button');
const proposal = document.querySelector('#proposal');
reviewButton.addEventListener('click', () => {
  proposal.hidden = !proposal.hidden;
  reviewButton.setAttribute('aria-expanded', String(!proposal.hidden));
  reviewButton.textContent = proposal.hidden ? 'Ver revisão de exemplo' : 'Ocultar revisão';
});
document.querySelector('#check-proposal').addEventListener('click', () => {
  document.querySelector('#proposal-status').textContent = 'Prévia aberta. A rotina de exemplo continua disponível para edição.';
});

let restStarted = false;
let restEndsAt = 0;
const restClock = document.querySelector('#rest-clock');
let timer = 0;
function updateRest() {
  window.clearTimeout(timer);
  const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');
  restClock.textContent = mins + ':' + secs;
  if (remaining > 0) timer = window.setTimeout(updateRest, 300);
}
document.querySelector('#skip-rest').addEventListener('click', () => {
  restEndsAt = 0;
  updateRest();
  document.querySelector('#workout-status').textContent = 'Descanso encerrado.';
});
document.querySelector('#finish-workout').addEventListener('click', () => {
  const count = document.querySelectorAll('.set-check input:checked').length;
  document.querySelector('#workout-status').textContent = 'Treino de exemplo finalizado com ' + count + (count === 1 ? ' série concluída.' : ' séries concluídas.');
});
navigate(false);
