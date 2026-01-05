const state = {
  startTime: "",
  endTime: "",
  fuelSpent: "",
  runs: [],
};

const elements = {
  startTime: document.getElementById("startTime"),
  endTime: document.getElementById("endTime"),
  fuelSpent: document.getElementById("fuelSpent"),
  totalKm: document.getElementById("totalKm"),
  totalMinutes: document.getElementById("totalMinutes"),
  runKm: document.getElementById("runKm"),
  runMinutes: document.getElementById("runMinutes"),
  addRun: document.getElementById("addRun"),
  runsList: document.getElementById("runsList"),
  voiceToggle: document.getElementById("voiceToggle"),
  voiceStatus: document.getElementById("voiceStatus"),
  lastTranscript: document.getElementById("lastTranscript"),
  confirmPanel: document.getElementById("confirmPanel"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmYes: document.getElementById("confirmYes"),
  confirmEdit: document.getElementById("confirmEdit"),
  confirmNo: document.getElementById("confirmNo"),
};

const STORAGE_KEY = "painel99food_state";
let confirmationHandlers = null;
let recognition = null;
let voiceActive = false;

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const loadState = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    state.startTime = parsed.startTime || "";
    state.endTime = parsed.endTime || "";
    state.fuelSpent = parsed.fuelSpent || "";
    state.runs = Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch (error) {
    console.warn("Falha ao carregar estado.", error);
  }
};

const formatNumber = (value) => {
  if (value === "") return "";
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
};

const formatMinutes = (minutes) => {
  if (Number.isNaN(minutes)) return "";
  return `${minutes} min`;
};

const computeTotals = () => {
  const totalKm = state.runs.reduce((sum, run) => sum + run.km, 0);
  const totalMinutes = state.runs.reduce((sum, run) => sum + run.minutes, 0);
  return { totalKm, totalMinutes };
};

const updateUI = () => {
  elements.startTime.value = state.startTime;
  elements.endTime.value = state.endTime;
  elements.fuelSpent.value = state.fuelSpent;

  const { totalKm, totalMinutes } = computeTotals();
  elements.totalKm.value = totalKm ? formatNumber(totalKm) : "0";
  elements.totalMinutes.value = totalMinutes ? totalMinutes.toString() : "0";

  elements.runsList.innerHTML = "";
  state.runs.forEach((run, index) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <span>${index + 1}</span>
      <span>${formatNumber(run.km)} km</span>
      <span>${formatMinutes(run.minutes)}</span>
      <span><button type="button" data-index="${index}">Remover</button></span>
    `;
    elements.runsList.appendChild(row);
  });
};

const showConfirmation = ({ message, onConfirm, onEdit, onCancel }) => {
  elements.confirmMessage.textContent = message;
  elements.confirmPanel.classList.remove("hidden");
  confirmationHandlers = { onConfirm, onEdit, onCancel };
};

const closeConfirmation = () => {
  elements.confirmPanel.classList.add("hidden");
  confirmationHandlers = null;
};

const handleConfirmation = (action) => {
  if (!confirmationHandlers) return;
  const handler = confirmationHandlers[action];
  closeConfirmation();
  if (handler) handler();
};

const applyDayField = (field, value) => {
  state[field] = value;
  saveState();
  updateUI();
};

const addRun = ({ km, minutes }) => {
  state.runs.push({ km, minutes });
  saveState();
  updateUI();
};

const removeRun = (index) => {
  state.runs.splice(index, 1);
  saveState();
  updateUI();
};

const parseNumber = (value) => {
  if (!value) return null;
  const normalized = value.replace(/,/g, ".");
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeText = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

const extractTime = (text) => {
  const match = text.match(/(\d{1,2})[:h\s](\d{2})/);
  if (match) {
    const hours = match[1].padStart(2, "0");
    const minutes = match[2];
    return `${hours}:${minutes}`;
  }
  return null;
};

const handleVoiceCommand = (transcript) => {
  const normalized = normalizeText(transcript);

  if (normalized.includes("inicio do dia")) {
    const time = extractTime(normalized);
    if (time) {
      showConfirmation({
        message: `Definir início do dia para ${time}. Precisa de alteração?`,
        onConfirm: () => applyDayField("startTime", time),
        onEdit: () => elements.startTime.focus(),
      });
      return;
    }
  }

  if (normalized.includes("fim do dia")) {
    const time = extractTime(normalized);
    if (time) {
      showConfirmation({
        message: `Definir fim do dia para ${time}. Precisa de alteração?`,
        onConfirm: () => applyDayField("endTime", time),
        onEdit: () => elements.endTime.focus(),
      });
      return;
    }
  }

  if (normalized.includes("combustivel") || normalized.includes("gastei")) {
    const match = normalized.match(/(\d+[.,]?\d*)/);
    const value = match ? parseNumber(match[1]) : null;
    if (value !== null) {
      showConfirmation({
        message: `Registrar combustível em R$ ${value.toFixed(2)}. Precisa de alteração?`,
        onConfirm: () => applyDayField("fuelSpent", value.toFixed(2)),
        onEdit: () => elements.fuelSpent.focus(),
      });
      return;
    }
  }

  if (normalized.includes("corrida")) {
    const kmMatch = normalized.match(/(\d+[.,]?\d*)\s*km/);
    const minMatch = normalized.match(/(\d+[.,]?\d*)\s*(minuto|minutos|min)/);
    const kmValue = kmMatch ? parseNumber(kmMatch[1]) : null;
    const minutesValue = minMatch ? parseNumber(minMatch[1]) : null;

    if (kmValue !== null && minutesValue !== null) {
      showConfirmation({
        message: `Registrar corrida de ${kmValue} km em ${minutesValue} min. Precisa de alteração?`,
        onConfirm: () => addRun({ km: kmValue, minutes: minutesValue }),
        onEdit: () => {
          elements.runKm.value = kmValue;
          elements.runMinutes.value = minutesValue;
          elements.runKm.focus();
        },
      });
      return;
    }
  }

  showConfirmation({
    message:
      "Não consegui identificar o comando. Precisa de alteração ou quer tentar de novo?",
    onConfirm: () => {},
    onEdit: () => elements.runKm.focus(),
  });
};

const updateVoiceStatus = () => {
  if (voiceActive) {
    elements.voiceStatus.textContent = "Ouvindo...";
    elements.voiceStatus.classList.add("active");
    elements.voiceToggle.textContent = "🛑 Parar áudio";
  } else {
    elements.voiceStatus.textContent = "Voz desligada";
    elements.voiceStatus.classList.remove("active");
    elements.voiceToggle.textContent = "🎙️ Falar com a IA";
  }
};

const setupVoiceRecognition = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.lastTranscript.textContent = transcript;
    handleVoiceCommand(transcript);
  };

  recognition.onend = () => {
    voiceActive = false;
    updateVoiceStatus();
  };
};

const startVoice = () => {
  if (!recognition) {
    elements.lastTranscript.textContent =
      "Seu navegador não suporta reconhecimento de voz.";
    return;
  }
  voiceActive = true;
  updateVoiceStatus();
  recognition.start();
};

const stopVoice = () => {
  if (recognition && voiceActive) {
    recognition.stop();
  }
  voiceActive = false;
  updateVoiceStatus();
};

const handleManualRun = () => {
  const km = parseNumber(elements.runKm.value);
  const minutes = parseNumber(elements.runMinutes.value);

  if (km === null || minutes === null) {
    showConfirmation({
      message: "Preencha quilômetros e tempo para registrar. Precisa de alteração?",
      onConfirm: () => {},
      onEdit: () => elements.runKm.focus(),
    });
    return;
  }

  addRun({ km, minutes });
  elements.runKm.value = "";
  elements.runMinutes.value = "";

  showConfirmation({
    message: "Corrida registrada. Precisa de alteração?",
    onConfirm: () => {},
    onEdit: () => {
      removeRun(state.runs.length - 1);
      elements.runKm.value = km;
      elements.runMinutes.value = minutes;
      elements.runKm.focus();
    },
  });
};

const bindEvents = () => {
  elements.startTime.addEventListener("change", (event) => {
    applyDayField("startTime", event.target.value);
  });

  elements.endTime.addEventListener("change", (event) => {
    applyDayField("endTime", event.target.value);
  });

  elements.fuelSpent.addEventListener("change", (event) => {
    applyDayField("fuelSpent", event.target.value);
  });

  elements.addRun.addEventListener("click", handleManualRun);

  elements.runsList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const index = Number(button.dataset.index);
    if (Number.isNaN(index)) return;
    removeRun(index);
  });

  elements.voiceToggle.addEventListener("click", () => {
    if (voiceActive) {
      stopVoice();
    } else {
      startVoice();
    }
  });

  elements.confirmYes.addEventListener("click", () => handleConfirmation("onConfirm"));
  elements.confirmEdit.addEventListener("click", () => handleConfirmation("onEdit"));
  elements.confirmNo.addEventListener("click", () => handleConfirmation("onCancel"));
};

loadState();
setupVoiceRecognition();
bindEvents();
updateUI();
updateVoiceStatus();
