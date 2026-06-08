const DATA_DIRECTORY = 'data';

const embeddedLessons = {
  'data/integrals.json': {
    title: 'integrals.json',
    cards: [
      { key: '\\int x^n \\, dx', value: '\\frac{x^{n+1}}{n+1} + C' },
      { key: '\\int \\frac{1}{x} \\, dx', value: '\\ln|x| + C' },
      { key: '\\int e^x \\, dx', value: 'e^x + C' },
      { key: '\\int \\cos(x) \\, dx', value: '\\sin(x) + C' },
      { key: '\\int \\sin(x) \\, dx', value: '-\\cos(x) + C' },
      { key: '\\int a^x \\, dx', value: '\\frac{a^x}{\\ln(a)} + C' }
    ]
  },
  'data/derivatives.json': {
    title: 'derivatives.json',
    cards: [
      { key: '\\frac{d}{dx} x^n', value: 'n x^{n-1}' },
      { key: '\\frac{d}{dx} \\ln|x|', value: '\\frac{1}{x}' },
      { key: '\\frac{d}{dx} e^x', value: 'e^x' },
      { key: '\\frac{d}{dx} a^x', value: 'a^x \\ln(a)' },
      { key: '\\frac{d}{dx} \\sin x', value: '\\cos x' },
      { key: '\\frac{d}{dx} \\cos x', value: '-\\sin x' },
      { key: '\\frac{d}{dx} \\tan x', value: '\\sec^2 x' },
      { key: '\\frac{d}{dx} \\arctan x', value: '\\frac{1}{1+x^2}' },
      { key: '\\frac{d}{dx} \\sinh x', value: '\\cosh x' },
      { key: '\\frac{d}{dx} \\cosh x', value: '\\sinh x' },
      { key: '\\frac{d}{dx} \\arcsin x', value: '\\frac{1}{\\sqrt{1-x^2}}' },
      { key: '\\frac{d}{dx} \\sqrt{x}', value: '\\frac{1}{2\\sqrt{x}}' }
    ]
  }
};

const state = {
  lessons: [],
  activeLesson: null,
  queue: [],
  wrongQueue: [],
  currentCard: null,
  revealed: false,
  stats: {
    good: 0,
    bad: 0,
    rounds: 1
  }
};

let elements = {};

function bindElements() {
  elements = {
    menuView: document.getElementById('menuView'),
    lessonView: document.getElementById('lessonView'),
    summaryView: document.getElementById('summaryView'),
    errorView: document.getElementById('errorView'),
    lessonGrid: document.getElementById('lessonGrid'),
    cardButton: document.getElementById('cardButton'),
    cardContent: document.getElementById('cardContent'),
    answerPanel: document.getElementById('answerPanel'),
    goodButton: document.getElementById('goodButton'),
    badButton: document.getElementById('badButton'),
    summaryTitle: document.getElementById('summaryTitle'),
    summaryCopy: document.getElementById('summaryCopy'),
    summaryCards: document.getElementById('summaryCards'),
    summaryRounds: document.getElementById('summaryRounds'),
    summaryGood: document.getElementById('summaryGood'),
    summaryBad: document.getElementById('summaryBad'),
    backButton: document.getElementById('backButton'),
    errorMessage: document.getElementById('errorMessage')
  };
}

let revealBackgroundTimer = null;

function clearRevealBackground() {
  if (revealBackgroundTimer) {
    window.clearTimeout(revealBackgroundTimer);
    revealBackgroundTimer = null;
  }
  document.body.classList.remove('reveal-good', 'reveal-bad');
}

function setRevealBackground(isGood) {
  document.body.classList.remove('reveal-good', 'reveal-bad');
  document.body.classList.add(isGood ? 'reveal-good' : 'reveal-bad');
  if (revealBackgroundTimer) {
    window.clearTimeout(revealBackgroundTimer);
  }
  revealBackgroundTimer = window.setTimeout(() => {
    document.body.classList.remove('reveal-good', 'reveal-bad');
    revealBackgroundTimer = null;
  }, 220);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showView(view) {
  [elements.menuView, elements.lessonView, elements.summaryView, elements.errorView].forEach((section) => {
    section.classList.add('hidden');
  });
  elements[`${view}View`].classList.remove('hidden');
}

function shuffle(items) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function getTitle(filePath) {
  const name = filePath.split('/').pop() || filePath;
  return name.replace(/\.json$/i, '');
}

function normalizeLesson(filePath, data) {
  const source = data || embeddedLessons[filePath];
  if (!Array.isArray(source?.cards)) {
    return null;
  }

  return {
    filePath,
    title: getTitle(filePath),
    tone: filePath.includes('productivity') ? 'sky' : 'green',
    cards: source.cards.map((card) => ({
      key: card.key,
      value: card.value
    }))
  };
}

async function init() {
  const lessonFiles = Object.keys(embeddedLessons).sort();
  state.lessons = lessonFiles.map((filePath) => normalizeLesson(filePath)).filter(Boolean);

  if (state.lessons.length === 0) {
    elements.errorMessage.textContent = 'No lesson files were found in the data folder.';
    showView('error');
    return;
  }

  renderMenu();
  showView('menu');
}

function renderLatex(value) {
  const target = elements.cardContent;
  target.classList.remove('lesson-card-content');
  void target.offsetWidth;
  target.classList.add('lesson-card-content');

  if (!value) {
    target.textContent = '';
    return;
  }

  if (value.includes('$') || value.includes('\\(') || value.includes('\\[')) {
    renderMixedContent(target, value);
    return;
  }

  if (shouldRenderPlainText(value)) {
    target.textContent = value;
    return;
  }

  try {
    target.innerHTML = katex.renderToString(value, {
      throwOnError: false,
      displayMode: false
    });
  } catch {
    target.textContent = value;
  }
}

function renderMixedContent(target, value) {
  const fragments = String(value).split(/(\$[^$]+\$|\\\((?:.|\n)+?\\\))/g).filter(Boolean);
  target.replaceChildren();

  fragments.forEach((fragment) => {
    const isDollarMath = fragment.startsWith('$') && fragment.endsWith('$');
    const isParenMath = fragment.startsWith('\\(') && fragment.endsWith('\\)');

    if (isDollarMath || isParenMath) {
      const math = fragment.slice(isDollarMath ? 1 : 2, isDollarMath ? -1 : -2);
      const mathNode = document.createElement('span');

      if (window.katex) {
        try {
          mathNode.innerHTML = katex.renderToString(math, {
            throwOnError: false,
            displayMode: false
          });
        } catch {
          mathNode.textContent = math;
        }
      } else {
        mathNode.textContent = math;
      }

      target.appendChild(mathNode);
      return;
    }

    target.appendChild(document.createTextNode(fragment));
  });
}

function shouldRenderPlainText(value) {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.includes('$')) {
    return false;
  }

  return !(/[\\^_{}]/.test(trimmed));
}

function pulseAnswerButtons() {
  [elements.goodButton, elements.badButton].forEach((button) => {
    button.classList.remove('button-pop');
    void button.offsetWidth;
    button.classList.add('button-pop');
  });
}

function renderMenu() {
  elements.lessonGrid.innerHTML = '';

  state.lessons.forEach((lesson) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'group min-h-44 rounded-[1.75rem] border border-white/5 px-6 py-7 text-left transition hover:scale-[1.01] hover:border-white/15 sm:min-h-52';
    button.classList.add(lesson.tone === 'sky' ? 'lesson-card-sky' : 'lesson-card-green');
    button.innerHTML = `
      <div class="lesson-card-content flex h-full flex-col items-center justify-center gap-4 text-center">
        <span class="break-words text-center text-2xl font-medium leading-tight text-white sm:text-3xl">${escapeHtml(lesson.title)}</span>
        <span class="inline-flex w-fit rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white/70">${lesson.cards.length} cards</span>
      </div>
    `;
    button.addEventListener('click', () => startLesson(lesson));
    elements.lessonGrid.appendChild(button);
  });
}

function startLesson(lesson) {
  clearRevealBackground();
  state.activeLesson = lesson;
  state.queue = shuffle(lesson.cards);
  state.wrongQueue = [];
  state.currentCard = null;
  state.revealed = false;
  state.stats = { good: 0, bad: 0, rounds: 1 };
  showView('lesson');
  nextCard();
}

function nextCard() {
  if (state.queue.length === 0) {
    if (state.wrongQueue.length > 0) {
      state.queue = shuffle(state.wrongQueue);
      state.wrongQueue = [];
      state.stats.rounds += 1;
      nextCard();
      return;
    }

    finishLesson();
    return;
  }

  state.currentCard = state.queue.shift();
  state.revealed = false;
  elements.cardButton.classList.remove('card-revealed');
  elements.answerPanel.classList.add('hidden');
  renderLatex(state.currentCard.key);
}

function revealCard() {
  if (!state.currentCard || state.revealed) {
    return;
  }

  state.revealed = true;
  renderLatex(state.currentCard.value);
  elements.answerPanel.classList.remove('hidden');
  elements.answerPanel.classList.remove('reveal-in');
  void elements.answerPanel.offsetWidth;
  elements.answerPanel.classList.add('reveal-in');
  pulseAnswerButtons();
}

function answer(isGood) {
  if (!state.currentCard || !state.revealed) {
    return;
  }


  if (isGood) {
    state.stats.good += 1;
  } else {
    state.stats.bad += 1;
    state.wrongQueue.push(state.currentCard);
  }

  state.currentCard = null;
  state.revealed = false;
  elements.cardButton.classList.remove('card-revealed');
  nextCard();
}

function finishLesson() {
  const total = state.activeLesson.cards.length;
  elements.summaryTitle.textContent = state.activeLesson.title;
  elements.summaryCopy.textContent = `Cards: ${total} | Rounds: ${state.stats.rounds}`;
  elements.summaryCards.textContent = String(total);
  elements.summaryRounds.textContent = String(state.stats.rounds);
  elements.summaryGood.textContent = String(state.stats.good);
  elements.summaryBad.textContent = String(state.stats.bad);
  showView('summary');

  // Animate summary pieces with a small stagger
  const statEls = [
    elements.summaryTitle,
    elements.summaryCopy,
    elements.summaryCards,
    elements.summaryRounds,
    elements.summaryGood,
    elements.summaryBad
  ];

  statEls.forEach((el, i) => {
    if (!el) return;
    el.classList.remove('stat-pop');
    // stagger by 60ms
    el.style.animationDelay = `${i * 60}ms`;
    // force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('stat-pop');
    el.addEventListener('animationend', () => {
      el.style.animationDelay = '';
    }, { once: true });
  });
}

function backToMenu() {
  clearRevealBackground();
  state.activeLesson = null;
  state.queue = [];
  state.wrongQueue = [];
  state.currentCard = null;
  state.revealed = false;
  elements.cardButton.classList.remove('card-revealed');
  showView('menu');
}

// `loadLesson` and network-based discovery removed — using embeddedLessons only

document.addEventListener('DOMContentLoaded', () => {
  bindElements();

  if (!elements.cardButton) return;

  elements.cardButton.addEventListener('click', revealCard);
  elements.cardButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      revealCard();
    }
  });

  if (elements.goodButton) {
    elements.goodButton.addEventListener('click', (event) => {
      event.stopPropagation();
      answer(true);
    });
  }

  if (elements.badButton) {
    elements.badButton.addEventListener('click', (event) => {
      event.stopPropagation();
      answer(false);
    });
  }

  if (elements.backButton) {
    elements.backButton.addEventListener('click', backToMenu);
  }

  init();
});