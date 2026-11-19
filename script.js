
// ========================================
// HELIOS - AWS CLOUD MONITORING DASHBOARD
// ========================================

const API_URL =
  "https://ykluhwdx47.execute-api.us-east-1.amazonaws.com/prod/status";

const INSTANCES_API_URL =
  "https://ykluhwdx47.execute-api.us-east-1.amazonaws.com/prod/instances";

const $ = (id) => document.getElementById(id);

const refreshBtn = $("refreshBtn");

let eventCount = 0;
let charts = {};

// ========================================
// BASIC HELPERS
// ========================================

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setDot(id, state) {
  const element = $(id);
  if (!element) return;

  element.className = "small-dot";

  if (state === "good") {
    element.classList.add("good");
  } else if (state === "bad") {
    element.classList.add("bad");
  } else {
    element.classList.add("muted");
  }
}

function setConnection(connected, message) {
  setText("connectionLabel", message);
  setText("connectionText", message);

  const pill = $("connectionPill");
  const dot = pill?.querySelector(".status-dot");

  if (pill) {
    pill.style.borderColor = connected
      ? "rgba(81,214,160,.3)"
      : "rgba(255,119,127,.3)";
  }

  if (dot) {
    dot.style.background = connected ? "#51d6a0" : "#ff777f";
  }
}

// ========================================
// EVENT LOG
// ========================================

function addEvent(eventName, description, status = "pending") {
  const table = $("eventRows");
  if (!table) return;

  if (eventCount === 0) table.innerHTML = "";

  const row = document.createElement("tr");

  const eventCell = document.createElement("td");
  const descriptionCell = document.createElement("td");
  const timeCell = document.createElement("td");
  const statusCell = document.createElement("td");

  eventCell.textContent = eventName;
  descriptionCell.textContent = description;
  timeCell.textContent = new Date().toLocaleTimeString();

  const badge = document.createElement("span");
  badge.className = `event-badge ${status}`;
  badge.textContent = status.toUpperCase();

  statusCell.appendChild(badge);
  row.append(eventCell, descriptionCell, timeCell, statusCell);

  table.prepend(row);
  eventCount++;

  while (table.children.length > 8) {
    table.removeChild(table.lastElementChild);
  }
}

// ========================================
// API RESPONSE NORMALIZATION
// ========================================

function normalizeResponse(result) {
  let data = result;

  if (data && typeof data.body === "string") {
    data = JSON.parse(data.body);
  } else if (data && data.body && typeof data.body === "object") {
    data = data.body;
  }

  if (!data || typeof data !== "object") {
    throw new Error("Invalid AWS API response.");
  }

  return data;
}

// ========================================
// STATUS DISPLAY
// ========================================

function displayStatus(elementId, value, dotId, healthTextId) {
  const normalized = String(value ?? "Unknown");
  setText(elementId, normalized);

  const lower = normalized.toLowerCase();

  if (
    lower.includes("running") ||
    lower.includes("healthy") ||
    lower.includes("inservice") ||
    lower === "ok"
  ) {
    setDot(dotId, "good");
    setText(healthTextId, "AWS reports healthy");
  } else if (
    lower.includes("stopped") ||
    lower.includes("unhealthy") ||
    lower.includes("failed") ||
    lower.includes("terminated")
  ) {
    setDot(dotId, "bad");
    setText(healthTextId, "AWS reports an issue");
  } else {
    setDot(dotId, "muted");
    setText(healthTextId, "Status needs verification");
  }
}

// ========================================
// CHART CREATION
// ========================================

function createChart(canvasId, label, color, unit) {
  const canvas = $(canvasId);

  if (!canvas || typeof Chart === "undefined") {
    console.error("Chart.js or chart canvas unavailable:", canvasId);
    return;
  }

  charts[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: color + "22",
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: color
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: {
          ticks: { color: "#8493aa", maxTicksLimit: 6 },
          grid: { color: "rgba(154,177,210,0.07)" }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#8493aa",
            callback: value => value + unit
          },
          grid: { color: "rgba(154,177,210,0.07)" }
        }
      }
    }
  });
}

function initializeCharts() {
  if (typeof Chart === "undefined") {
    console.error("Chart.js did not load.");
    setText("cpuNote", "Chart.js could not load. Check internet connection.");
    return;
  }

  createChart("cpuChart", "CPU Utilization", "#a78bfa", "%");
  createChart("networkInChart", "Network In", "#52d9e8", " B");
  createChart("networkOutChart", "Network Out", "#51d6a0", " B");
}

// ========================================
// UPDATE CHART DATA
// ========================================

function updateChart(canvasId, series) {
  const chart = charts[canvasId];
  if (!chart) return;

  const validPoints = (Array.isArray(series) ? series : [])
    .filter(point =>
      point.timestamp &&
      point.value !== null &&
      point.value !== undefined &&
      Number.isFinite(Number(point.value))
    )
    .sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

  chart.data.labels = validPoints.map(point =>
    new Date(point.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })
  );

  chart.data.datasets[0].data = validPoints.map(point =>
    Number(point.value)
  );

  chart.update("none");
}

// ========================================
// CLOUDWATCH METRICS
// ========================================

function updateCloudWatchCharts(data) {
  updateChart("cpuChart", data.cpu_series);
  updateChart("networkInChart", data.network_in_series);
  updateChart("networkOutChart", data.network_out_series);

  const metrics = [
    {
      field: "cpu_utilization",
      valueId: "cpuValue",
      noteId: "cpuNote",
      suffix: "%",
      decimals: 2,
      message: "Waiting for CPU data"
    },
    {
      field: "network_in",
      valueId: "networkIn",
      noteId: "networkInNote",
      suffix: " bytes",
      decimals: 1,
      message: "Waiting for Network In data"
    },
    {
      field: "network_out",
      valueId: "networkOut",
      noteId: "networkOutNote",
      suffix: " bytes",
      decimals: 1,
      message: "Waiting for Network Out data"
    }
  ];

  metrics.forEach(metric => {
    const raw = data[metric.field];
    const number = Number(raw);

    if (
      raw !== null &&
      raw !== undefined &&
      Number.isFinite(number)
    ) {
      setText(
        metric.valueId,
        number.toFixed(metric.decimals) + metric.suffix
      );
      setText(metric.noteId, "Live CloudWatch data connected");
    } else {
      setText(metric.valueId, "—");
      setText(metric.noteId, metric.message);
    }
  });
}

// ========================================
// UPDATE DASHBOARD
// ========================================

function updateDashboard(data) {
  const ec2Status = data.ec2_status ?? "Unknown";
  const instanceId = data.ec2_instance_id ?? "Unavailable";
  const asgStatus = data.autoscaling_status ?? "Unknown";

  displayStatus(
    "instanceStatus",
    ec2Status,
    "ec2Dot",
    "ec2HealthText"
  );

  displayStatus(
    "asgStatus",
    asgStatus,
    "asgDot",
    "asgHealthText"
  );

  setText("instanceId", `Instance ID: ${instanceId}`);
  setText("mapInstanceId", instanceId);
  setText("mapEc2Status", ec2Status);
  setText("mapAsgStatus", asgStatus);

  const healthy = data.healthy_instances;

  if (healthy !== undefined && healthy !== null) {
    setText("healthyCount", healthy);
    setText("healthyText", "Value received from AWS API");
    setDot("healthyDot", Number(healthy) > 0 ? "good" : "bad");
  } else {
    setText("healthyCount", "—");
    setText("healthyText", "Not provided by API");
    setDot("healthyDot", "muted");
  }

  setText("espStatus", data.esp32_status ?? "Not Connected");

  const ec2Healthy = String(ec2Status).toLowerCase().includes("running");
  const asgHealthy = String(asgStatus).toLowerCase().includes("healthy");

  setText(
    "workflowTag",
    ec2Healthy && asgHealthy
      ? "AWS resources reporting healthy"
      : "Review infrastructure status"
  );

  updateCloudWatchCharts(data);

  setText(
    "lastUpdated",
    `Last updated: ${new Date().toLocaleTimeString()}`
  );

  addEvent(
    "AWS status refresh",
    `EC2: ${ec2Status} | Auto Scaling: ${asgStatus}`,
    ec2Healthy && asgHealthy ? "success" : "pending"
  );
}

// ========================================
// EC2 INSTANCE MANAGEMENT - READ ONLY
// ========================================

async function loadInstances() {
  const rows = $("instanceRows");
  if (!rows) return;

  try {
    const response = await fetch(INSTANCES_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Instance API returned HTTP ${response.status}`);
    }

    const result = await response.json();
    const data = normalizeResponse(result);

    if (!Array.isArray(data.instances)) {
      throw new Error("The API response does not contain an instances list.");
    }

    const instances = data.instances;

    setText("totalInstances", instances.length);
    setText(
      "runningInstances",
      instances.filter(i => i.state === "running").length
    );
    setText(
      "stoppedInstances",
      instances.filter(i => i.state === "stopped").length
    );

    rows.innerHTML = "";

    if (instances.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "No EC2 instances found.";
      tr.appendChild(td);
      rows.appendChild(tr);
    }

    instances.forEach(instance => {
      const tr = document.createElement("tr");

      const values = [
        `${instance.name || "Unnamed"}\n${instance.instance_id || "--"}`,
        instance.instance_type || "--",
        instance.state || "Unknown",
        instance.private_ip || "--",
        instance.public_ip || "--",
        instance.availability_zone || "--"
      ];

      values.forEach((value, index) => {
        const td = document.createElement("td");
        td.textContent = value;

        if (index === 2) {
          const state = String(value).toLowerCase();

          td.style.color =
            state === "running" ? "#51d6a0" :
            state === "stopped" ? "#f5b66a" :
            "#ff777f";
        }

        tr.appendChild(td);
      });

      rows.appendChild(tr);
    });

    setText(
      "instanceMessage",
      `Successfully retrieved ${instances.length} instance(s) from AWS.`
    );

  } catch (error) {
    console.error("EC2 inventory error:", error);

    rows.innerHTML = "";

    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Unable to retrieve EC2 instances.";
    tr.appendChild(td);
    rows.appendChild(tr);

    setText("totalInstances", "—");
    setText("runningInstances", "—");
    setText("stoppedInstances", "—");
    setText("instanceMessage", `Instance API error: ${error.message}`);
  }
}

// ========================================
// LOAD LIVE AWS STATUS
// ========================================

async function loadAWSStatus() {
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "↻ Refreshing...";
  }

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`AWS API request failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    const data = normalizeResponse(result);

    updateDashboard(data);
    setConnection(true, "AWS API connected");

  } catch (error) {
    console.error("HELIOS AWS API error:", error);
    setConnection(false, "AWS API connection failed");

    setText("workflowTag", "Unable to retrieve AWS status");

    setText(
      "lastUpdated",
      `Last attempt: ${new Date().toLocaleTimeString()}`
    );

    addEvent(
      "API connection",
      error.message || "Could not retrieve AWS status",
      "error"
    );

  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "↻ Refresh";
    }
  }

  // Load the EC2 inventory independently.
  await loadInstances();
}

// ========================================
// REFRESH BUTTON
// ========================================

if (refreshBtn) {
  refreshBtn.addEventListener("click", loadAWSStatus);
}

// ========================================
// START DASHBOARD
// ========================================

initializeCharts();

addEvent(
  "Dashboard started",
  "HELIOS monitoring interface loaded",
  "success"
);

loadAWSStatus();

// Refresh AWS data every 30 seconds.
setInterval(loadAWSStatus, 30000);

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("createInstanceForm");
    const result = document.getElementById("createInstanceResult");

    if (!form || !result) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const name = document.getElementById("newInstanceName").value.trim();
        const type = document.getElementById("newInstanceType").value;
        const os = document.getElementById("newInstanceOS").value;
        const count = Number(document.getElementById("newInstanceCount").value);

        if (!name) {
            result.textContent = "Please enter an instance name.";
            return;
        }

        const confirmed = confirm(
            `Simulate creating ${count} EC2 instance(s)?\n\n` +
            `Name: ${name}\nType: ${type}\nOS: ${os}\n\n` +
            "This will NOT launch real AWS instances."
        );

        if (!confirmed) return;

        const simulatedIds = Array.from(
            { length: count },
            (_, index) => `SIM-HELIOS-${Date.now()}-${index + 1}`
        );

        result.textContent =
            `Simulation successful! ${count} instance(s) configured.\n` +
            `Name: ${name}\nType: ${type}\nOS: ${os}\n` +
            `Simulated IDs: ${simulatedIds.join(", ")}\n` +
            "No real AWS resources were created.";

        form.reset();
    });
});

