let originalItems = [];
let shuffledItems = [];
let currentIndex = -1;
let isTextVisible = false; // Oculto por defecto

const STORAGE_API_KEY = 'english_voice_gemini_api_key';
const STORAGE_SPEED_KEY = 'english_voice_speech_rate';
const STORAGE_VOICE_KEY = 'english_voice_selected_name';

// DOM Elements
const apiKeyInput = document.getElementById('gemini-api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const clearApiKeyBtn = document.getElementById('clear-api-key-btn');
const apiKeyStatus = document.getElementById('api-key-status');

const speedSelect = document.getElementById('speed-select');
const voiceSelect = document.getElementById('voice-select');

const sourceRadios = document.querySelectorAll('input[name="json-source"]');
const serverPanel = document.getElementById('server-panel');
const uploadPanel = document.getElementById('upload-panel');
const serverJsonSelect = document.getElementById('server-json-select');
const fileInput = document.getElementById('json-file');
const fileStatus = document.getElementById('file-status');

const progressEl = document.getElementById('progress');
const toggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
const questionImage = document.getElementById('question-image');
const questionText = document.getElementById('question-text');
const repeatBtn = document.getElementById('repeat-btn');
const micBtn = document.getElementById('mic-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');
const userAnswerEl = document.getElementById('user-answer');
const starRatingEl = document.getElementById('star-rating');
const feedbackEl = document.getElementById('feedback');

// API Key management (localStorage)
function refreshApiKeyStatus() {
  const saved = localStorage.getItem(STORAGE_API_KEY);
  if (saved) {
    apiKeyInput.value = saved;
    apiKeyStatus.textContent = '✅ API key saved in this browser';
  } else {
    apiKeyInput.value = '';
    apiKeyStatus.textContent = '⚠️ No API key saved (required for open questions)';
  }
}

saveApiKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyStatus.textContent = '❌ Enter a valid API key first';
    return;
  }
  localStorage.setItem(STORAGE_API_KEY, key);
  apiKeyStatus.textContent = '✅ API key saved in this browser';
});

clearApiKeyBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_API_KEY);
  refreshApiKeyStatus();
});

refreshApiKeyStatus();

// Speech Speed & Voices (2 to 3 English voices)
const synth = window.speechSynthesis;
let availableVoices = [];

function initSpeedPreference() {
  const savedSpeed = localStorage.getItem(STORAGE_SPEED_KEY);
  if (savedSpeed && ['0.75', '0.95', '1.2'].includes(savedSpeed)) {
    speedSelect.value = savedSpeed;
  }
}

speedSelect.addEventListener('change', () => {
  localStorage.setItem(STORAGE_SPEED_KEY, speedSelect.value);
});

function populateVoiceOptions() {
  if (!synth) return;
  const allVoices = synth.getVoices() || [];

  const englishVoices = allVoices.filter((v) =>
    v.lang && v.lang.toLowerCase().startsWith('en')
  );

  englishVoices.sort((a, b) => {
    const aScore = a.lang.toLowerCase().startsWith('en-us') ? 0 : a.lang.toLowerCase().startsWith('en-gb') ? 1 : 2;
    const bScore = b.lang.toLowerCase().startsWith('en-us') ? 0 : b.lang.toLowerCase().startsWith('en-gb') ? 1 : 2;
    return aScore - bScore;
  });

  availableVoices = englishVoices.slice(0, 3);

  const savedVoiceName = localStorage.getItem(STORAGE_VOICE_KEY);
  voiceSelect.innerHTML = '';

  if (availableVoices.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Default English (en-US)';
    voiceSelect.appendChild(opt);
    return;
  }

  availableVoices.forEach((voice, idx) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `Voice ${idx + 1}: ${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (savedVoiceName && availableVoices.some((v) => v.name === savedVoiceName)) {
    voiceSelect.value = savedVoiceName;
  } else {
    voiceSelect.value = availableVoices[0].name;
    localStorage.setItem(STORAGE_VOICE_KEY, availableVoices[0].name);
  }
}

voiceSelect.addEventListener('change', () => {
  localStorage.setItem(STORAGE_VOICE_KEY, voiceSelect.value);
});

initSpeedPreference();
populateVoiceOptions();
if (synth && typeof synth.addEventListener === 'function') {
  synth.addEventListener('voiceschanged', populateVoiceOptions);
}

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
  questionImage.src = '';
  questionImage.classList.add('hidden');
  questionText.textContent = 'Select or load a JSON to start practicing';
  questionText.classList.remove('concealed', 'hidden');
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

function normalizeBase64ImageSrc(rawImage) {
  const trimmed = rawImage.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

// Normaliza y valida:
// - Solo frase: { phrase: "..." }
// - Imagen + respuesta: { image: "base64...", answer: "..." } (o answers: ["..."])
// - Pregunta + respuestas: { question: "...", answers: ["..."] }
// - Solo pregunta abierta: { question: "..." }
function parseAndNormalizeDataset(rawData) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error('JSON must be a non-empty array.');
  }

  return rawData.map((item) => {
    if (typeof item.image === 'string' && item.image.trim() !== '') {
      const answers = Array.isArray(item.answers)
        ? item.answers.filter((a) => typeof a === 'string' && a.trim() !== '')
        : typeof item.answer === 'string' && item.answer.trim() !== ''
          ? [item.answer.trim()]
          : [];

      if (answers.length === 0) {
        throw new Error('Image item must contain "answer" (or "answers").');
      }

      return {
        type: 'image',
        imageSrc: normalizeBase64ImageSrc(item.image),
        displayPrompt: `Answer: "${answers[0]}"`,
        spokenPrompt: '',
        expectedTargets: answers
      };
    }

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

      const question = item.question.trim();
      return {
        type: answers.length > 0 ? 'qa_closed' : 'qa_open',
        displayPrompt: question,
        spokenPrompt: question,
        expectedTargets: answers
      };
    }

    throw new Error('Each item must contain "image"+"answer", "phrase", or "question".');
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
  questionImage.src = '';
  questionImage.classList.add('hidden');
  questionText.textContent = 'Ready. Tap "Next Item" to begin.';
  questionText.classList.remove('concealed', 'hidden');
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
  questionImage.src = '';
  questionImage.classList.add('hidden');
  questionText.textContent = 'Check that the JSON exists and follows a valid format.';
  questionText.classList.remove('concealed', 'hidden');
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

// 2. Text-to-Speech (TTS) in English with selected speed & voice
function speak(text) {
  if (!synth || !text) return;
  synth.cancel();
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';

    const rateValue = parseFloat(speedSelect.value);
    utterance.rate = Number.isFinite(rateValue) ? rateValue : 0.95;

    const selectedVoiceName = voiceSelect.value;
    if (selectedVoiceName) {
      const chosenVoice = availableVoices.find((v) => v.name === selectedVoiceName);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang || 'en-US';
      }
    }

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

// Calcula palabras coincidentes EN ORDEN (LCS sobre palabras)
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

// Evalúa frases o respuestas cerradas por orden y número de palabras correctas
function evaluateClosedSpeech(alternatives, validTargets) {
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

// Evalúa preguntas abiertas con Gemini y da ejemplo corto si no es correcta
async function evaluateOpenQuestionWithGemini(question, spokenAlternatives) {
  const apiKey = localStorage.getItem(STORAGE_API_KEY);
  if (!apiKey) {
    throw new Error('Missing Gemini API key.');
  }

  const prompt = [
    'You are a concise English speaking tutor.',
    `Question: "${question}"`,
    `Spoken transcripts (top alternatives): ${JSON.stringify(spokenAlternatives)}`,
    'Judge if the student answered the question properly and naturally in English (accept valid personal details like names and natural contractions).',
    'Rate from 0 to 5 stars considering relevance to the question, word order, and English correctness.',
    'Keep "feedback" VERY SHORT (max 1 short sentence).',
    'If stars < 4 or the answer is wrong/off-topic, start with "Incorrect. You can say: " followed by a brief natural example answer (e.g., "Incorrect. You can say: My name is John.").',
    'If stars >= 4, give a short positive note (e.g., "Great answer!").',
    'Respond ONLY with valid JSON: {"stars": 0..5, "feedback": "..."}'
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(rawText);

  const stars = Math.max(0, Math.min(5, Number(parsed.stars) || 0));
  const feedback = typeof parsed.feedback === 'string' && parsed.feedback.trim()
    ? parsed.feedback.trim()
    : stars >= 4
      ? 'Great answer!'
      : 'Incorrect. Try answering the question directly.';

  return { stars, feedback };
}

function renderStars(stars) {
  const filled = '★'.repeat(stars);
  const empty = '☆'.repeat(5 - stars);
  return `${filled}${empty} (${stars}/5)`;
}

// Renderiza la pregunta/frase/imagen respetando si está oculta o visible
function renderCurrentPrompt() {
  if (currentIndex < 0 || !shuffledItems[currentIndex]) return;
  const item = shuffledItems[currentIndex];

  if (item.type === 'image') {
    questionImage.src = item.imageSrc;
    questionImage.classList.remove('hidden');

    if (isTextVisible) {
      questionText.textContent = item.displayPrompt;
      questionText.classList.remove('concealed', 'hidden');
      toggleVisibilityBtn.textContent = '🙈 Hide';
    } else {
      questionText.textContent = '🔒 Answer hidden — tap "Show" to reveal';
      questionText.classList.add('concealed');
      questionText.classList.remove('hidden');
      toggleVisibilityBtn.textContent = '👁️ Show';
    }
    return;
  }

  questionImage.src = '';
  questionImage.classList.add('hidden');
  questionText.classList.remove('hidden');

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

// 4. Load next random item
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

  const currentItem = shuffledItems[currentIndex];
  isTextVisible = false;

  progressEl.textContent = `Item ${currentIndex + 1} of ${shuffledItems.length}`;
  renderCurrentPrompt();
  userAnswerEl.textContent = '';
  starRatingEl.textContent = '';
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';

  toggleVisibilityBtn.disabled = false;
  repeatBtn.disabled = currentItem.type === 'image' && !currentItem.spokenPrompt;
  micBtn.disabled = false;

  if (currentItem.type !== 'image' && currentItem.spokenPrompt) {
    speak(currentItem.spokenPrompt);
  } else if (synth) {
    synth.cancel();
  }
}

// Button listeners
nextBtn.addEventListener('click', loadNextItem);

repeatBtn.addEventListener('click', () => {
  if (currentIndex >= 0) {
    const currentItem = shuffledItems[currentIndex];
    const textToSpeak = currentItem.spokenPrompt || currentItem.expectedTargets?.[0] || '';
    speak(textToSpeak);
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

  recognition.onresult = async (event) => {
    const alternatives = Array.from(event.results[0]).map((alt) => alt.transcript);
    const primarySpoken = alternatives[0];
    const currentItem = shuffledItems[currentIndex];

    userAnswerEl.textContent = `You said: "${primarySpoken}"`;

    if (currentItem.type === 'qa_open') {
      statusEl.textContent = 'Evaluating with Gemini...';
      micBtn.disabled = true;

      try {
        const aiResult = await evaluateOpenQuestionWithGemini(currentItem.spokenPrompt, alternatives);
        starRatingEl.textContent = renderStars(aiResult.stars);
        feedbackEl.textContent = aiResult.feedback;

        if (aiResult.stars >= 4) {
          feedbackEl.className = 'feedback correct';
        } else if (aiResult.stars >= 2) {
          feedbackEl.className = 'feedback partial';
        } else {
          feedbackEl.className = 'feedback incorrect';
        }

        speak(aiResult.feedback);
      } catch (err) {
        starRatingEl.textContent = '☆☆☆☆☆ (0/5)';
        feedbackEl.textContent = 'Incorrect. Save a valid Gemini API key to evaluate open questions.';
        feedbackEl.className = 'feedback incorrect';
        console.log(err);
      } finally {
        statusEl.textContent = '';
        micBtn.disabled = false;
      }
      return;
    }

    // Modo cerrado: frase, imagen con respuesta o pregunta con respuestas esperadas
    const result = evaluateClosedSpeech(alternatives, currentItem.expectedTargets);
    starRatingEl.textContent = renderStars(result.stars);

    if (result.stars >= 4) {
      feedbackEl.textContent = `Great! (${result.matchedWords}/${result.totalWords} ordered words matched)`;
      feedbackEl.className = 'feedback correct';
      speak('Great job!');
    } else if (result.stars >= 2) {
      feedbackEl.textContent = `Incorrect. You can say: ${result.bestTarget}`;
      feedbackEl.className = 'feedback partial';
      speak(`Incorrect. You can say: ${result.bestTarget}`);
    } else {
      feedbackEl.textContent = `Incorrect. You can say: ${result.bestTarget}`;
      feedbackEl.className = 'feedback incorrect';
      speak(`Incorrect. You can say: ${result.bestTarget}`);
    }
  };

  recognition.onspeechend = () => {
    recognition.stop();
    micBtn.classList.remove('listening');
    if (statusEl.textContent === 'Listening... speak in English.') {
      statusEl.textContent = '';
    }
  };

  recognition.onerror = (event) => {
    micBtn.classList.remove('listening');
    statusEl.textContent = `Microphone error: ${event.error}`;
  };
}