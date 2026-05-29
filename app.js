let config = null;
let purchasedValues = {};
let lastGenerated = false;

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  await loadConfig();
  initializeState();
  populateDropdowns();
  renderStatsTable();
  attachEvents();
  updateAll();
});

function cacheElements() {
  elements.characterName = document.getElementById("characterName");
  elements.birthplaceSelect = document.getElementById("birthplaceSelect");
  elements.raceSelect = document.getElementById("raceSelect");
  elements.classSelect = document.getElementById("classSelect");

  elements.birthplaceDescription = document.getElementById("birthplaceDescription");
  elements.raceDescription = document.getElementById("raceDescription");
  elements.classDescription = document.getElementById("classDescription");
  elements.raceBonuses = document.getElementById("raceBonuses");
  elements.classBonuses = document.getElementById("classBonuses");

  elements.totalPoints = document.getElementById("totalPoints");
  elements.usedPoints = document.getElementById("usedPoints");
  elements.remainingPoints = document.getElementById("remainingPoints");
  elements.pointWarning = document.getElementById("pointWarning");
  elements.statsTable = document.getElementById("statsTable");

  elements.generateButton = document.getElementById("generateButton");
  elements.downloadButton = document.getElementById("downloadButton");
  elements.canvas = document.getElementById("cardCanvas");
}

async function loadConfig() {
  const response = await fetch("data/config.json");
  if (!response.ok) {
    throw new Error("Failed to load config.json");
  }
  config = await response.json();
  document.title = config.settings.siteTitle || "角色卡生成器";
}

function initializeState() {
  for (const stat of config.stats) {
    purchasedValues[stat.id] = stat.base;
  }

  elements.totalPoints.textContent = config.settings.totalPoints;
}

function populateDropdowns() {
  populateSelect(elements.birthplaceSelect, config.birthplaces);
  populateSelect(elements.raceSelect, config.races);
  populateSelect(elements.classSelect, config.classes);
}

function populateSelect(select, items) {
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }
}

function attachEvents() {
  elements.characterName.addEventListener("input", () => {
    lastGenerated = false;
    elements.downloadButton.disabled = true;
  });

  elements.birthplaceSelect.addEventListener("change", updateAll);
  elements.raceSelect.addEventListener("change", updateAll);
  elements.classSelect.addEventListener("change", updateAll);

  elements.generateButton.addEventListener("click", () => {
    renderCard();
    lastGenerated = true;
    elements.downloadButton.disabled = false;
  });

  elements.downloadButton.addEventListener("click", downloadCard);
}

function updateAll() {
  updateDescriptions();
  updateStatsDisplay();
  lastGenerated = false;
  elements.downloadButton.disabled = true;
}

function getSelectedBirthplace() {
  return config.birthplaces.find(item => item.id === elements.birthplaceSelect.value);
}

function getSelectedRace() {
  return config.races.find(item => item.id === elements.raceSelect.value);
}

function getSelectedClass() {
  return config.classes.find(item => item.id === elements.classSelect.value);
}

function updateDescriptions() {
  const birthplace = getSelectedBirthplace();
  const race = getSelectedRace();
  const cls = getSelectedClass();

  elements.birthplaceDescription.textContent = birthplace?.description || "";
  elements.raceDescription.textContent = race?.description || "";
  elements.classDescription.textContent = cls?.description || "";

  elements.raceBonuses.textContent = "種族修正：" + formatBonuses(race?.statBonuses || {});
  elements.classBonuses.textContent = "職業修正：" + formatBonuses(cls?.statBonuses || {});
}

function formatBonuses(bonuses) {
  const parts = [];

  for (const stat of config.stats) {
    const value = bonuses[stat.id] || 0;
    if (value !== 0) {
      parts.push(`${stat.label} ${value > 0 ? "+" : ""}${value}`);
    }
  }

  return parts.length ? parts.join("、") : "無";
}

function renderStatsTable() {
  elements.statsTable.innerHTML = "";

  const header = document.createElement("div");
  header.className = "stat-header";
  header.innerHTML = `
    <div>屬性</div>
    <div>基礎值</div>
    <div>購買值</div>
    <div>種族修正</div>
    <div>職業修正</div>
    <div>最終值</div>
  `;
  elements.statsTable.appendChild(header);

  for (const stat of config.stats) {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.dataset.statId = stat.id;

    row.innerHTML = `
      <div>${stat.label}</div>
      <div class="base-value"></div>
      <div class="stat-control">
        <button type="button" class="decrease">−</button>
        <span class="purchased-value"></span>
        <button type="button" class="increase">＋</button>
      </div>
      <div class="race-bonus"></div>
      <div class="class-bonus"></div>
      <div class="final-value"></div>
    `;

    row.querySelector(".decrease").addEventListener("click", () => changePurchasedValue(stat.id, -1));
    row.querySelector(".increase").addEventListener("click", () => changePurchasedValue(stat.id, 1));

    elements.statsTable.appendChild(row);
  }
}

function changePurchasedValue(statId, delta) {
  const stat = config.stats.find(item => item.id === statId);
  const current = purchasedValues[statId];
  const next = current + delta;

  if (next < stat.minPurchasedValue || next > stat.maxPurchasedValue) {
    return;
  }

  if (delta > 0) {
    const currentCalculation = calculateStats();
    const currentCost = getPointCost(current);
    const nextCost = getPointCost(next);
    const extraCost = nextCost - currentCost;

    if (currentCalculation.remainingPoints < extraCost) {
      return;
    }
  }

  purchasedValues[statId] = next;
  updateStatsDisplay();
  lastGenerated = false;
  elements.downloadButton.disabled = true;
}

function calculateStats() {
  const race = getSelectedRace();
  const cls = getSelectedClass();

  let usedPoints = 0;
  const results = {};

  for (const stat of config.stats) {
    const purchasedValue = purchasedValues[stat.id];
    const cost = getPointCost(purchasedValue);
    const raceBonus = race?.statBonuses?.[stat.id] || 0;
    const classBonus = cls?.statBonuses?.[stat.id] || 0;
    const finalValue = purchasedValue + raceBonus + classBonus;

    usedPoints += cost;

    results[stat.id] = {
      label: stat.label,
      base: stat.base,
      purchasedValue,
      cost,
      raceBonus,
      classBonus,
      finalValue
    };
  }

  const remainingPoints = config.settings.totalPoints - usedPoints;

  return {
    stats: results,
    usedPoints,
    remainingPoints,
    isValid: remainingPoints >= 0
  };
}

function getPointCost(targetValue) {
  const entry = config.pointCost.find(item => item.targetValue === targetValue);
  return entry ? entry.cost : 9999;
}

function updateStatsDisplay() {
  const calculation = calculateStats();

  elements.usedPoints.textContent = calculation.usedPoints;
  elements.remainingPoints.textContent = calculation.remainingPoints;

  if (!calculation.isValid) {
    elements.pointWarning.textContent = "配點已超出上限，請降低部分屬性。";
    elements.generateButton.disabled = true;
  } else {
    elements.pointWarning.textContent = "";
    elements.generateButton.disabled = false;
  }

  for (const stat of config.stats) {
    const row = elements.statsTable.querySelector(`[data-stat-id="${stat.id}"]`);
    const data = calculation.stats[stat.id];

    row.querySelector(".base-value").textContent = data.base;
    row.querySelector(".purchased-value").textContent = data.purchasedValue;
    row.querySelector(".race-bonus").textContent = formatSigned(data.raceBonus);
    row.querySelector(".class-bonus").textContent = formatSigned(data.classBonus);
    row.querySelector(".final-value").textContent = data.finalValue;
  }
}

function formatSigned(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

async function renderCard() {
  const canvas = elements.canvas;
  const ctx = canvas.getContext("2d");

  const width = config.settings.cardWidth;
  const height = config.settings.cardHeight;

  canvas.width = width;
  canvas.height = height;

  await drawTemplate(ctx, width, height);

  const calculation = calculateStats();
  const birthplace = getSelectedBirthplace();
  const race = getSelectedRace();
  const cls = getSelectedClass();

  const characterName = elements.characterName.value.trim() || "未命名角色";

  ctx.fillStyle = "#2d2118";
  ctx.textBaseline = "top";

  drawFittedText(ctx, characterName, 110, 150, 620, 56, "bold 52px serif");

  ctx.font = "34px serif";
  ctx.fillText(`出生地：${birthplace.name}`, 110, 250);
  ctx.fillText(`種族：${race.name}`, 110, 305);
  ctx.fillText(`職業：${cls.name}`, 110, 360);

  ctx.font = "bold 40px serif";
  ctx.fillText("屬性", 110, 500);

  let y = 570;
  ctx.font = "34px serif";

  for (const stat of config.stats) {
    const data = calculation.stats[stat.id];
    ctx.fillText(`${data.label}`, 130, y);
    ctx.fillText(String(data.finalValue), 390, y);
    y += 62;
  }

  ctx.font = "26px sans-serif";
  ctx.fillStyle = "#5e341c";
  wrapText(ctx, `種族：${race.description}`, 110, 1010, 980, 34, 3);
  wrapText(ctx, `職業：${cls.description}`, 110, 1135, 980, 34, 3);
}

async function drawTemplate(ctx, width, height) {
  const imagePath = config.settings.templateImagePath;

  try {
    const img = await loadImage(imagePath);
    ctx.drawImage(img, 0, 0, width, height);
  } catch (error) {
    drawFallbackTemplate(ctx, width, height);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawFallbackTemplate(ctx, width, height) {
  ctx.fillStyle = "#f1dfb8";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#8a6a3f";
  ctx.lineWidth = 18;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  ctx.strokeStyle = "#b8965d";
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, width - 160, height - 160);

  ctx.fillStyle = "#e3c990";
  ctx.fillRect(780, 130, 300, 420);

  ctx.fillStyle = "#5e341c";
  ctx.font = "28px sans-serif";
  ctx.fillText("頭像預留區", 840, 320);

  ctx.font = "bold 42px serif";
  ctx.fillText("龍族大陸角色卡", 110, 80);
}

function drawFittedText(ctx, text, x, y, maxWidth, fontSize, fontFamily) {
  let size = fontSize;
  while (size > 24) {
    ctx.font = fontFamily.replace(/\d+px/, `${size}px`);
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    size -= 2;
  }

  let truncated = text;
  ctx.font = fontFamily.replace(/\d+px/, `${size}px`);

  while (ctx.measureText(truncated + "…").width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }

  ctx.fillText(truncated + "…", x, y);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = text.split("");
  let line = "";
  let lines = [];

  for (const char of chars) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line !== "") {
      lines.push(line);
      line = char;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
}

function downloadCard() {
  if (!lastGenerated) {
    renderCard();
  }

  const characterName = elements.characterName.value.trim() || "character";
  const safeName = characterName.replace(/[\\/:*?"<>|]/g, "_");

  const link = document.createElement("a");
  link.download = `${safeName}_dragon_continent_card.png`;
  link.href = elements.canvas.toDataURL("image/png");
  link.click();
}
