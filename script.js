const canvas = document.querySelector("#point-cloud");
const ctx = canvas.getContext("2d");
const pointCount = 180;
const points = [];

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * ratio);
  canvas.height = Math.floor(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function seedPoints() {
  points.length = 0;
  for (let index = 0; index < pointCount; index += 1) {
    points.push({
      x: Math.random() * canvas.clientWidth,
      y: Math.random() * canvas.clientHeight,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      size: Math.random() * 2.2 + 1,
      hue: Math.random() > 0.62 ? "79, 119, 183" : "20, 122, 112",
    });
  }
}

function drawPointField() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  points.forEach((point, index) => {
    point.x += point.vx;
    point.y += point.vy;

    if (point.x < 0 || point.x > canvas.clientWidth) point.vx *= -1;
    if (point.y < 0 || point.y > canvas.clientHeight) point.vy *= -1;

    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${point.hue}, 0.58)`;
    ctx.fill();

    for (let next = index + 1; next < points.length; next += 1) {
      const other = points[next];
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      if (distance < 92) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(other.x, other.y);
        ctx.strokeStyle = `rgba(23, 33, 31, ${0.12 * (1 - distance / 92)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  });

  window.requestAnimationFrame(drawPointField);
}

resizeCanvas();
seedPoints();
drawPointField();

window.addEventListener("resize", () => {
  resizeCanvas();
  seedPoints();
});

const scenes = {
  "scene-a": {
    title: "TODO Example A",
    copy: "Replace with a short caption explaining the selected result.",
    metricOne: "0.00",
    metricTwo: "0%",
  },
  "scene-b": {
    title: "TODO Example B",
    copy: "Use this slot for a stronger qualitative comparison, ablation, or failure case.",
    metricOne: "0.00",
    metricTwo: "0%",
  },
  "scene-c": {
    title: "TODO Example C",
    copy: "Use this slot for a second domain, dataset, scenario, or user study highlight.",
    metricOne: "0.00",
    metricTwo: "0%",
  },
};

const tabs = document.querySelectorAll(".scene-tab");
const sceneTitle = document.querySelector("#scene-title");
const sceneCopy = document.querySelector("#scene-copy");
const metricOne = document.querySelector("#metric-one");
const metricTwo = document.querySelector("#metric-two");
const sceneVisual = document.querySelector("#scene-visual");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const sceneKey = tab.dataset.scene;
    const scene = scenes[sceneKey];

    tabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");

    sceneTitle.textContent = scene.title;
    sceneCopy.textContent = scene.copy;
    metricOne.textContent = scene.metricOne;
    metricTwo.textContent = scene.metricTwo;
    sceneVisual.className = `scene-visual ${sceneKey}`;
  });
});
