import {
  initFeedback,
  playBadFeedback,
  playCompleteFeedback,
  playGoodFeedback,
  playRevealFeedback,
  playTapFeedback,
  unlockFeedback
} from './feedback.js';

const LESSON_THEMES = [
  { id: 'violet', from: '#7c5cff', to: '#ff6bcb', glow: 'rgba(124, 92, 255, 0.38)' },
  { id: 'ocean', from: '#2f9bff', to: '#22d3ee', glow: 'rgba(47, 155, 255, 0.34)' },
  { id: 'sunset', from: '#ff8f43', to: '#ff4d8d', glow: 'rgba(255, 120, 80, 0.34)' },
  { id: 'mint', from: '#2dd4bf', to: '#4ade80', glow: 'rgba(45, 212, 191, 0.32)' },
  { id: 'berry', from: '#c084fc', to: '#6366f1', glow: 'rgba(192, 132, 252, 0.34)' },
  { id: 'gold', from: '#fbbf24', to: '#f97316', glow: 'rgba(251, 191, 36, 0.3)' },
  { id: 'rose', from: '#fb7185', to: '#f472b6', glow: 'rgba(251, 113, 133, 0.32)' },
  { id: 'lime', from: '#a3e635', to: '#14b8a6', glow: 'rgba(163, 230, 53, 0.28)' }
];

function getGitHubConfig() {
  const owner = document.querySelector('meta[name="github-owner"]')?.content?.trim();
  const repo = document.querySelector('meta[name="github-repo"]')?.content?.trim();

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function getSiteBaseUrl() {
  const config = getGitHubConfig();

  if (config && window.location.hostname.endsWith('github.io')) {
    return `https://${config.owner}.github.io/${config.repo}/`;
  }

  return new URL('./', window.location.href).href;
}

function getLessonsManifestUrl() {
  return new URL('lessons.json', getSiteBaseUrl()).href;
}

function getLessonFileName(lessonName) {
  return `${lessonName.replace(/\.json$/i, '')}.json`;
}

function getLessonDataUrl(lessonName) {
  return new URL(`data/${getLessonFileName(lessonName)}`, getSiteBaseUrl()).href;
}

function getLessonTheme(fileName) {
  let hash = 0;

  for (let index = 0; index < fileName.length; index += 1) {
    hash = (hash + fileName.charCodeAt(index) * (index + 3)) % LESSON_THEMES.length;
  }

  return LESSON_THEMES[hash];
}

function applyLessonTheme(theme) {
  document.body.dataset.lessonTheme = theme.id;
  document.documentElement.style.setProperty('--lesson-from', theme.from);
  document.documentElement.style.setProperty('--lesson-to', theme.to);
  document.documentElement.style.setProperty('--lesson-glow', theme.glow);
}

function clearLessonTheme() {
  delete document.body.dataset.lessonTheme;
  document.documentElement.style.removeProperty('--lesson-from');
  document.documentElement.style.removeProperty('--lesson-to');
  document.documentElement.style.removeProperty('--lesson-glow');
}

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
    answerButtons: document.getElementById('answerButtons'),
    goodButton: document.getElementById('goodButton'),
    badButton: document.getElementById('badButton'),
    summaryTitle: document.getElementById('summaryTitle'),
    summaryCopy: document.getElementById('summaryCopy'),
    summaryCards: document.getElementById('summaryCards'),
    summaryRounds: document.getElementById('summaryRounds'),
    summaryGood: document.getElementById('summaryGood'),
    summaryBad: document.getElementById('summaryBad'),
    backButton: document.getElementById('backButton'),
    exitLessonButton: document.getElementById('exitLessonButton'),
    lessonProgressFill: document.getElementById('lessonProgressFill'),
    lessonProgressLabel: document.getElementById('lessonProgressLabel'),
    cardHint: document.getElementById('cardHint'),
    errorMessage: document.getElementById('errorMessage')
  };
}

const FEEDBACK_ANIMATION_MS = 500;

let revealBackgroundTimer = null;
let appBgElement = null;

function getAppBgElement() {
  if (!appBgElement) {
    appBgElement = document.querySelector('.app-bg');
  }

  return appBgElement;
}

function clearRevealBackground() {
  if (revealBackgroundTimer) {
    window.clearTimeout(revealBackgroundTimer);
    revealBackgroundTimer = null;
  }

  getAppBgElement()?.classList.remove('feedback-good', 'feedback-bad');
}

function setRevealBackground(isGood) {
  const appBg = getAppBgElement();
  if (!appBg) {
    return;
  }

  clearRevealBackground();
  appBg.classList.add(isGood ? 'feedback-good' : 'feedback-bad');

  revealBackgroundTimer = window.setTimeout(() => {
    appBg.classList.remove('feedback-good', 'feedback-bad');
    revealBackgroundTimer = null;
  }, FEEDBACK_ANIMATION_MS);
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

function getLessonTitle(fileName) {
  return fileName.replace(/\.json$/i, '');
}

function normalizeLesson(fileName, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const cards = Object.entries(data).map(([key, value]) => ({
    key: String(key),
    value: String(value)
  }));

  if (cards.length === 0) {
    return null;
  }

  return {
    filePath: `data/${fileName}`,
    title: getLessonTitle(fileName),
    theme: getLessonTheme(fileName),
    cards
  };
}

async function discoverLessonFiles() {
  const response = await fetch(getLessonsManifestUrl());
  if (!response.ok) {
    throw new Error('Could not load lessons.json.');
  }

  const lessons = await response.json();
  if (!Array.isArray(lessons)) {
    throw new Error('lessons.json must be a JSON array of lesson names.');
  }

  return lessons
    .filter((lessonName) => typeof lessonName === 'string' && lessonName.trim())
    .map((lessonName) => getLessonFileName(lessonName.trim()))
    .sort((left, right) => left.localeCompare(right));
}

async function loadLesson(fileName) {
  const filePath = `data/${fileName}`;
  const response = await fetch(getLessonDataUrl(fileName));
  if (!response.ok) {
    throw new Error(`Could not load ${filePath}.`);
  }

  const data = await response.json();
  const lesson = normalizeLesson(fileName, data);
  if (!lesson) {
    throw new Error(`${filePath} must be a JSON object of question-answer pairs.`);
  }

  return lesson;
}

async function init() {
  try {
    const lessonFiles = await discoverLessonFiles();
    const lessons = await Promise.all(lessonFiles.map((fileName) => loadLesson(fileName)));
    state.lessons = lessons.sort((left, right) => left.title.localeCompare(right.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load lessons.';
    elements.errorMessage.textContent = window.location.protocol === 'file:'
      ? `${message} Run "npm start" and open http://localhost:3000 instead of opening the HTML file directly.`
      : message;
    showView('error');
    return;
  }

  if (state.lessons.length === 0) {
    elements.errorMessage.textContent = 'No lessons were listed in lessons.json.';
    showView('error');
    return;
  }

  renderMenu();
  showView('menu');
}

function fitCardContent() {
  const target = elements.cardContent;
  target.style.transform = 'scale(1)';

  const parent = target.parentElement;
  if (!parent) {
    return;
  }

  const availableHeight = parent.clientHeight - 12;
  const overflow = target.scrollHeight - availableHeight;

  if (overflow > 0 && availableHeight > 0) {
    const scale = Math.max(0.62, availableHeight / target.scrollHeight);
    target.style.transform = `scale(${scale})`;
  }
}

function renderLatex(value) {
  const target = elements.cardContent;
  target.classList.remove('lesson-card-content');
  target.style.transform = 'scale(1)';
  void target.offsetWidth;
  target.classList.add('lesson-card-content');

  if (!value) {
    target.textContent = '';
    requestAnimationFrame(fitCardContent);
    return;
  }

  if (value.includes('$') || value.includes('\\(') || value.includes('\\[')) {
    renderMixedContent(target, value);
    requestAnimationFrame(fitCardContent);
    return;
  }

  if (shouldRenderPlainText(value)) {
    target.textContent = value;
    requestAnimationFrame(fitCardContent);
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

  requestAnimationFrame(fitCardContent);
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

function showAnswerHint() {
  elements.cardHint.classList.remove('hidden');
  elements.answerButtons.classList.add('hidden');
  elements.answerPanel.classList.remove('reveal-in');
}

function showAnswerButtons() {
  elements.cardHint.classList.add('hidden');
  elements.answerButtons.classList.remove('hidden');
  elements.answerPanel.classList.remove('reveal-in');
  void elements.answerPanel.offsetWidth;
  elements.answerPanel.classList.add('reveal-in');
  pulseAnswerButtons();
}

function renderMenu() {
  elements.lessonGrid.innerHTML = '';

  state.lessons.forEach((lesson) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-card lesson-card-content';
    button.style.setProperty('--card-from', lesson.theme.from);
    button.style.setProperty('--card-to', lesson.theme.to);
    button.innerHTML = `
      <div class="lesson-card-inner">
        <h2 class="lesson-card-title">${escapeHtml(lesson.title)}</h2>
        <span class="lesson-card-badge">${lesson.cards.length} cards</span>
      </div>
    `;
    button.addEventListener('click', async () => {
      await unlockFeedback();
      playTapFeedback();
      startLesson(lesson);
    });
    elements.lessonGrid.appendChild(button);
  });
}

function updateLessonProgress() {
  if (!state.activeLesson) {
    return;
  }

  const total = state.activeLesson.cards.length;
  const completed = state.stats.good;
  const progress = total === 0 ? 0 : (completed / total) * 100;

  elements.lessonProgressFill.style.width = `${progress}%`;
  elements.lessonProgressLabel.textContent = `${completed} / ${total}`;
}

function startLesson(lesson) {
  clearRevealBackground();
  applyLessonTheme(lesson.theme);
  state.activeLesson = lesson;
  state.queue = shuffle(lesson.cards);
  state.wrongQueue = [];
  state.currentCard = null;
  state.revealed = false;
  state.stats = { good: 0, bad: 0, rounds: 1 };
  elements.cardButton.classList.remove('is-revealed');
  showAnswerHint();
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
  elements.cardButton.classList.remove('is-revealed');
  showAnswerHint();
  updateLessonProgress();
  renderLatex(state.currentCard.key);
}

async function revealCard() {
  if (!state.currentCard || state.revealed) {
    return;
  }

  await unlockFeedback();
  state.revealed = true;
  elements.cardButton.classList.add('is-revealed');
  playRevealFeedback();
  renderLatex(state.currentCard.value);
  showAnswerButtons();
}

function answer(isGood) {
  if (!state.currentCard || !state.revealed) {
    return;
  }


  if (isGood) {
    state.stats.good += 1;
    playGoodFeedback();
  } else {
    state.stats.bad += 1;
    state.wrongQueue.push(state.currentCard);
    playBadFeedback();
  }

  setRevealBackground(isGood);
  state.currentCard = null;
  state.revealed = false;
  elements.cardButton.classList.remove('is-revealed');
  nextCard();
}

function finishLesson() {
  const total = state.activeLesson.cards.length;
  applyLessonTheme(state.activeLesson.theme);
  elements.summaryTitle.textContent = state.activeLesson.title;
  elements.summaryCopy.textContent = `Cards: ${total} | Rounds: ${state.stats.rounds}`;
  elements.summaryCards.textContent = String(total);
  elements.summaryRounds.textContent = String(state.stats.rounds);
  elements.summaryGood.textContent = String(state.stats.good);
  elements.summaryBad.textContent = String(state.stats.bad);
  playCompleteFeedback();
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
  clearLessonTheme();
  state.activeLesson = null;
  state.queue = [];
  state.wrongQueue = [];
  state.currentCard = null;
  state.revealed = false;
  elements.cardButton.classList.remove('is-revealed');
  showAnswerHint();
  showView('menu');
}

document.addEventListener('DOMContentLoaded', () => {
  initFeedback();
  bindElements();

  if (!elements.cardButton) return;

  const unlockOnGesture = () => {
    void unlockFeedback();
  };

  elements.cardButton.addEventListener('touchend', unlockOnGesture, { passive: true });
  elements.cardButton.addEventListener('click', () => {
    void revealCard();
  });
  elements.answerPanel.addEventListener('click', (event) => {
    if (state.revealed || event.target.closest('#answerButtons')) {
      return;
    }

    revealCard();
  });
  elements.cardButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      revealCard();
    }
  });

  if (elements.goodButton) {
    elements.goodButton.addEventListener('touchend', unlockOnGesture, { passive: true });
    elements.goodButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await unlockFeedback();
      answer(true);
    });
  }

  if (elements.badButton) {
    elements.badButton.addEventListener('touchend', unlockOnGesture, { passive: true });
    elements.badButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await unlockFeedback();
      answer(false);
    });
  }

  if (elements.backButton) {
    elements.backButton.addEventListener('click', backToMenu);
  }

  if (elements.exitLessonButton) {
    elements.exitLessonButton.addEventListener('click', backToMenu);
  }

  window.addEventListener('resize', fitCardContent);

  init();
});