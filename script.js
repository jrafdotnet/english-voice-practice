let originalItems = [];
let shuffledItems = [];
let currentIndex = -1;
let isTextVisible = false; // Oculto por defecto

// DOM Elements
const sourceRadios = document.querySelectorAll('input[name="json-source"]');
const serverPanel = document.getElementById('server-panel');
const uploadPanel = document.getElementById('upload-panel');
const serverJsonSelect = document.getElementById('server-json-select');
const fileInput = document.getElementById('json-file');
const fileStatus = document.getElementById('file-status');
const progressEl = document.getElementById('progress');
const toggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
const questionText = document.getElementById('question-text');
const repeatBtn = document.getElementById('repeat-btn');
const micBtn = document.getElementById('mic-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');
const userAnswerEl = document.getElementById('user-answer');
const starRatingEl = document.getElementById('star-rating');
const feedbackEl = document.getElementById('feedback');

// Fisher-Yates shuffle for random order without repetition
function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 1. Radio buttons: Server JSON vs Load JSON
sourceRadios.forEach((radio) => {
  radio.addEventListener('change', (e) => {
    const mode = e.target.value;
    resetSessionState();

    if (mode === 'server') {
      serverPanel.classList.remove('hidden');
      uploadPanel.classList.add('hidden');
      fileStatus.textContent = 'Select a JSON file from the dropdown';
      if (serverJsonSelect.value) {
        loadServerJson(serverJsonSelect.value);
      }
    } else {
      serverPanel.classList.add('hidden');
      uploadPanel.classList.remove('hidden');
      fileStatus.textContent = 'No file loaded';
    }
  });
});

function resetSessionState() {
  originalItems = [];
  shuffledItems = [];
  currentIndex = -1;
  isTextVisible = false;

  progressEl.textContent = '';
  questionText.textContent = 'Select or load a JSON to start practicing';
  questionText.classList.remove('concealed');
  userAnswerEl.textContent = '';
  starRatingEl.textContent = '';
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  statusEl.textContent = '';

  toggleVisibilityBtn.disabled = true;
  toggleVisibilityBtn.textContent = '👁️ Show';
  repeatBtn.disabled = true;
  micBtn.disabled = true;
  nextBtn.disabled = true;
}

// Normaliza y valida ambos formatos:
// - Q&A: { question: "...", answers: ["..."] } (o answer: "...")
// - Phrase only: { phrase: "..." }
function parseAndNormalizeDataset(rawData) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error('JSON must be a non-empty array.');
  }

  return rawData.map((item) => {
    if (typeof item.phrase === 'string' && item.phrase.trim() !== '') {
      const phrase = item.phrase.trim();
      return {
        type: 'phrase',
        displayPrompt: `Say the phrase: "${phrase}"`,
        spokenPrompt: phrase,
        expectedTargets: [phrase]
      };
    }

    if (typeof item.question === 'string' && item.question.trim() !== '') {
      const answers = Array.isArray(item.answers)
        ? item.answers.filter((a) => typeof a === 'string' && a.trim() !== '')
        : typeof item.answer === 'string' && item.answer.trim() !== ''
          ? [item.answer.trim()]
          : [];

      if (answers.length === 0) {
        throw new Error('Q&A item missing valid answers.');
      }

      const question = item.question.trim();
      return {
        type: 'qa',
        displayPrompt: question,
        spokenPrompt: question,
        expectedTargets: answers
      };
    }

    throw new Error('Each item must contain "phrase" or "question" + "answers".');
  });
}

function initializeDataset(parsedData, sourceLabel) {
  const normalized = parseAndNormalizeDataset(parsedData);
  originalItems = normalized;
  shuffledItems = shuffleArray(originalItems);
  currentIndex = -1;
  isTextVisible = false;

  fileStatus.textContent = `✅ ${sourceLabel} (${originalItems.length} items)`;
  progressEl.textContent = '';
  questionText.textContent = 'Ready. Tap "Next Item" to begin.';
  questionText.classList.remove('concealed');
  userAnswerEl.textContent = '';
  starRatingEl.textContent = '';
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  statusEl.textContent = '';

  toggleVisibilityBtn.disabled = true;
  toggleVisibilityBtn.textContent = '👁️ Show';
  nextBtn.disabled = false;
  repeatBtn.disabled = true;
  micBtn.disabled = true;
}

function handleLoadError(sourceLabel) {
  fileStatus.textContent = `❌ Error loading ${sourceLabel}`;
  questionText.textContent = 'Check that the JSON exists and follows a valid format.';
  questionText.classList.remove('concealed');
  nextBtn.disabled = true;
  repeatBtn.disabled = true;
  micBtn.disabled = true;
  toggleVisibilityBtn.disabled = true;
}

// 1a. Fetch JSON from server dropdown
async function loadServerJson(url) {
  if (!url) return;
  fileStatus.textContent = `⏳ Loading ${url}...`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    initializeDataset(json, url.split('/').pop());
  } catch (err) {
    handleLoadError(url);
  }
}

serverJsonSelect.addEventListener('change', (e) => {
  if (e.target.value) {
    loadServerJson(e.target.value);
  } else {
    resetSessionState();
  }
});

// 1b. Load JSON file from device
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsedData = JSON.parse(e.target.result);
      initializeDataset(parsedData, file.name);
    } catch (err) {
      handleLoadError(file.name);
    }
  };
  reader.readAsText(file);
});

// 2. Text-to-Speech (TTS) in English
const synth = window.speechSynthesis;

function speak(text) {
  if (!synth) return;
  synth.cancel();
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    synth.speak(utterance);
  }, 150);
}

// 3. Speech-to-Text (STT) in English with 3 alternatives
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert('Your browser does not support speech recognition. Use Chrome on Android or Safari on iPhone.');
}

const recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
}

// Normalize English text & expand common contractions
function normalizeEnglish(text) {
  let clean = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .trim();

  const contractions = {
    "i'm": "i am",
    "you're": "you are",
    "he's": "he is",
    "she's": "she is",
    "it's": "it is",
    "we're": "we are",
    "they're": "they are",
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "can't": "cannot",
    "cannot": "can not",
    "won't": "will not",
    "wouldn't": "would not",
    "couldn't": "could not",
    "shouldn't": "should not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "haven't": "have not",
    "hasn't": "has not",
    "hadn't": "had not",
    "i've": "i have",
    "you've": "you have",
    "we've": "we have",
    "they've": "they have",
    "i'll": "i will",
    "you'll": "you will",
    "he'll": "he will",
    "she'll": "she will",
    "we'll": "we will",
    "they'll": "they will",
    "what's": "what is",
    "where's": "where is",
    "who's": "who is",
    "that's": "that is",
    "there's": "there is",
    "let's": "let us"
  };

  for (const [shortForm, fullForm] of Object.entries(contractions)) {
    const regex = new RegExp(`\\b${shortForm}\\b`, 'g');
    clean = clean.replace(regex, fullForm);
  }

  return clean
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calcula el número de palabras coincidentes EN ORDEN (Longest Common Subsequence en tokens)
function orderedMatchedWordsCount(expectedWords, spokenWords) {
  const m = expectedWords.length;
  const n = spokenWords.length;
  if (m === 0 || n === 0) return 0;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (expectedWords[i - 1] === spokenWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// Evalúa alternativas habladas frente a respuestas/frases válidas considerando orden y número de palabras correctas
function evaluateSpeech(alternatives, validTargets) {
  let bestResult = {
    stars: 0,
    matchedWords: 0,
    totalWords: 1,
    bestTarget: validTargets[0],
    scoreRatio: 0
  };

  for (const spokenAlt of alternatives) {
    const spokenNorm = normalizeEnglish(spokenAlt);
    const spokenWords = spokenNorm ? spokenNorm.split(' ') : [];

    for (const target of validTargets) {
      const targetNorm = normalizeEnglish(target);
      const targetWords = targetNorm ? targetNorm.split(' ') : [];
      const totalWords = Math.max(targetWords.length, 1);

      const matched = orderedMatchedWordsCount(targetWords, spokenWords);
      // Penaliza ligeramente palabras extra fuera de lugar para premiar orden y precisión
      const extraWordsPenalty = Math.max(0, spokenWords.length - matched) * 0.15;
      const rawRatio = Math.max(0, (matched - extraWordsPenalty) / totalWords);
      const ratio = spokenNorm === targetNorm ? 1 : Math.min(1, rawRatio);

      let stars = 0;
      if (ratio >= 0.99) stars = 5;
      else if (ratio >= 0.75) stars = 4;
      else if (ratio >= 0.5) stars = 3;
      else if (ratio >= 0.25) stars = 2;
      else if (matched >= 1) stars = 1;

      if (
        stars > bestResult.stars ||
        (stars === bestResult.stars && ratio > bestResult.scoreRatio)
      ) {
        bestResult = {
          stars,
          matchedWords: matched,
          totalWords,
          bestTarget: target,
          scoreRatio: ratio
        };
      }
    }
  }

  return bestResult;
}

function renderStars(stars) {
  const filled = '★'.repeat(stars);
  const empty = '☆'.repeat(5 - stars);
  return `${filled}${empty} (${stars}/5)`;
}

// Renderiza la pregunta/frase respetando si está oculta o visible
function renderCurrentPrompt() {
  if (currentIndex < 0 || !shuffledItems[currentIndex]) return;
  const item = shuffledItems[currentIndex];

  if (isTextVisible) {
    questionText.textContent = item.displayPrompt;
    questionText.classList.remove('concealed');
    toggleVisibilityBtn.textContent = '🙈 Hide';
  } else {
    questionText.textContent =
      item.type === 'phrase'
        ? '🔒 Phrase hidden — tap "Show" to reveal'
        : '🔒 Question hidden — tap "Show" to reveal';
    questionText.classList.add('concealed');
    toggleVisibilityBtn.textContent = '👁️ Show';
  }
}

toggleVisibilityBtn.addEventListener('click', () => {
  if (currentIndex < 0) return;
  isTextVisible = !isTextVisible;
  renderCurrentPrompt();
});

// 4. Load next random item (hidden by default)
function loadNextItem() {
  if (shuffledItems.length === 0) return;

  currentIndex++;

  if (currentIndex >= shuffledItems.length) {
    shuffledItems = shuffleArray(originalItems);
    currentIndex = 0;
    statusEl.textContent = '🔄 New random round started';
  } else {
    statusEl.textContent = '';
  }

  isTextVisible = false; // Siempre oculta al iniciar cada ítem
  const currentItem = shuffledItems[currentIndex];

  progressEl.textContent = `Item ${currentIndex + 1} of ${shuffledItems.length}`;
  renderCurrentPrompt();
  userAnswerEl.textContent = '';
  starRatingEl.textContent = '';
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';

  toggleVisibilityBtn.disabled = false;
  repeatBtn.disabled = false;
  micBtn.disabled = false;

  speak(currentItem.spokenPrompt);
}

// Button listeners
nextBtn.addEventListener('click', loadNextItem);

repeatBtn.addEventListener('click', () => {
  if (currentIndex >= 0) {
    speak(shuffledItems[currentIndex].spokenPrompt);
  }
});

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  try {
    synth.cancel();
    recognition.start();
  } catch (error) {
    recognition.stop();
  }
});

// Microphone events
if (recognition) {
  recognition.onstart = () => {
    micBtn.classList.add('listening');
    statusEl.textContent = 'Listening... speak in English.';
  };

  recognition.onresult = (event) => {
    const alternatives = Array.from(event.results[0]).map((alt) => alt.transcript);
    const primarySpoken = alternatives[0];
    const currentItem = shuffledItems[currentIndex];

    userAnswerEl.textContent = `You said: "${primarySpoken}"`;

    const result = evaluateSpeech(alternatives, currentItem.expectedTargets);
    starRatingEl.textContent = renderStars(result.stars);

    if (result.stars >= 4) {
      feedbackEl.textContent = `Great! (${result.matchedWords}/${result.totalWords} ordered words matched)`;
      feedbackEl.className = 'feedback correct';
      speak('Great job!');
    } else if (result.stars >= 2) {
      feedbackEl.textContent = `Partial (${result.matchedWords}/${result.totalWords} ordered words). Expected: ${result.bestTarget}`;
      feedbackEl.className = 'feedback partial';
      speak(`Almost. Expected: ${result.bestTarget}`);
    } else {
      feedbackEl.textContent = `Try again (${result.matchedWords}/${result.totalWords} ordered words). Expected: ${result.bestTarget}`;
      feedbackEl.className = 'feedback incorrect';
      speak(`Expected: ${result.bestTarget}`);
    }
  };

  recognition.onspeechend = () => {
    recognition.stop();
    micBtn.classList.remove('listening');
    statusEl.textContent = '';
  };

  recognition.onerror = (event) => {
    micBtn.classList.remove('listening');
    statusEl.textContent = `Microphone error: ${event.error}`;
  };
}