let originalQuestions = [];
let shuffledQuestions = [];
let currentIndex = -1;

// DOM Elements
const fileInput = document.getElementById('json-file');
const fileStatus = document.getElementById('file-status');
const progressEl = document.getElementById('progress');
const questionText = document.getElementById('question-text');
const repeatBtn = document.getElementById('repeat-btn');
const micBtn = document.getElementById('mic-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');
const userAnswerEl = document.getElementById('user-answer');
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

// 1. Load JSON file from device
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const parsedData = JSON.parse(e.target.result);

      if (!Array.isArray(parsedData) || parsedData.length === 0 || !parsedData[0].question) {
        throw new Error("Invalid JSON format.");
      }

      originalQuestions = parsedData;
      shuffledQuestions = shuffleArray(originalQuestions);
      currentIndex = -1;

      fileStatus.textContent = `✅ ${file.name} (${originalQuestions.length} questions)`;
      progressEl.textContent = "";
      questionText.textContent = 'File ready. Tap "Next Question" to begin.';
      userAnswerEl.textContent = "";
      feedbackEl.textContent = "";
      statusEl.textContent = "";

      nextBtn.disabled = false;
      repeatBtn.disabled = true;
      micBtn.disabled = true;
    } catch (err) {
      fileStatus.textContent = "❌ Error reading JSON file";
      questionText.textContent = "Check that your JSON structure is valid.";
      nextBtn.disabled = true;
    }
  };

  reader.readAsText(file);
});

// 2. Text-to-Speech (TTS) in English (mobile-friendly)
const synth = window.speechSynthesis;

function speak(text) {
  synth.cancel();
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95; // Slightly slower for clearer English learning
    synth.speak(utterance);
  }, 150);
}

// 3. Speech-to-Text (STT) in English with 3 alternatives
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  alert("Your browser does not support speech recognition. Use Chrome on Android or Safari on iPhone.");
}

const recognition = new SpeechRecognition();
recognition.lang = 'en-US';
recognition.interimResults = false;
recognition.maxAlternatives = 3; // Checks top 3 interpretations (helps with homophones)

// Normalize English text & expand common contractions
function normalizeEnglish(text) {
  let clean = text
    .toLowerCase()
    .replace(/[’‘]/g, "'") // Standardize apostrophes
    .trim();

  // Expand common English contractions so "I'm" matches "I am"
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

  // Remove punctuation and extra spaces
  return clean
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 4. Load next random question
function loadNextQuestion() {
  if (shuffledQuestions.length === 0) return;

  currentIndex++;

  if (currentIndex >= shuffledQuestions.length) {
    shuffledQuestions = shuffleArray(originalQuestions);
    currentIndex = 0;
    statusEl.textContent = "🔄 New random round started";
  } else {
    statusEl.textContent = "";
  }

  const currentQ = shuffledQuestions[currentIndex];

  progressEl.textContent = `Question ${currentIndex + 1} of ${shuffledQuestions.length}`;
  questionText.textContent = currentQ.question;
  userAnswerEl.textContent = "";
  feedbackEl.textContent = "";

  repeatBtn.disabled = false;
  micBtn.disabled = false;

  speak(currentQ.question);
}

// Button listeners
nextBtn.addEventListener('click', loadNextQuestion);

repeatBtn.addEventListener('click', () => {
  speak(shuffledQuestions[currentIndex].question);
});

micBtn.addEventListener('click', () => {
  try {
    synth.cancel();
    recognition.start();
  } catch (error) {
    recognition.stop();
  }
});

// Microphone events
recognition.onstart = () => {
  micBtn.classList.add('listening');
  statusEl.textContent = "Listening... speak in English.";
};

recognition.onresult = (event) => {
  // Extract all 3 speech recognition alternatives
  const alternatives = Array.from(event.results[0]).map(alt => alt.transcript);
  const primarySpoken = alternatives[0];

  const currentQ = shuffledQuestions[currentIndex];
  const validAnswers = Array.isArray(currentQ.answers) ? currentQ.answers : [currentQ.answer];

  userAnswerEl.textContent = `You said: "${primarySpoken}"`;

  // Check if ANY of the 3 spoken alternatives matches ANY valid answer
  const normalizedValid = validAnswers.map(ans => normalizeEnglish(ans));
  const isCorrect = alternatives.some(spokenAlt =>
    normalizedValid.includes(normalizeEnglish(spokenAlt))
  );

  if (isCorrect) {
    feedbackEl.textContent = "Correct!";
    feedbackEl.className = "feedback correct";
    speak("Correct!");
  } else {
    feedbackEl.textContent = `Incorrect. Expected: ${validAnswers[0]}`;
    feedbackEl.className = "feedback incorrect";
    speak(`Incorrect. The correct answer is ${validAnswers[0]}`);
  }
};

recognition.onspeechend = () => {
  recognition.stop();
  micBtn.classList.remove('listening');
  statusEl.textContent = "";
};

recognition.onerror = (event) => {
  micBtn.classList.remove('listening');
  statusEl.textContent = `Microphone error: ${event.error}`;
};

