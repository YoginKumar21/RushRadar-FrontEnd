// Dashboard logic: map generation, controls, and API connection
(function () { // Removed async from top level, we handle it inside
  const baseUrl = 'http://127.0.0.1:5000';
  
  // Coordinates for Whitefield (start) and Marathahalli (end)
  const startCoords = [12.9698, 77.7497];
  const endCoords = [12.9569, 77.6963];
  
  let map;
  let trendChart;
  let routeLayer = null;

  const predictionRanges = {
    shortTerm: [
      { id: '15min', label: 'Next 15 min' },
      { id: '1hr', label: '1 Hour' },
      { id: '2hr', label: '2 Hours' },
      { id: '3hr', label: '3 Hours' }
    ],
    longTerm: [
      { id: 'nextday', label: 'Next Day' },
      { id: 'weekly', label: 'Weekly' },
      { id: 'monthly', label: 'Monthly Trend' }
    ]
  };
  
  // DOM Elements
  const shortRangeEl = document.getElementById('shortRange');
  const longRangeEl = document.getElementById('longRange');
  const selectedLabelEl = document.getElementById('selectedLabel');
  const chartEl = document.getElementById('trendChart'); 
  const headerThemeToggle = document.getElementById('headerThemeToggle');

  // Stat Elements
  const countEl = document.getElementById('predictedCount');
  const classEl = document.getElementById('trafficClassification');
  const peakEl = document.getElementById('peakHours');
  const peakLabelEl = document.getElementById('peakHoursLabel');

  // --- THEME LOGIC ---
  const savedTheme = localStorage.getItem('rushradar_theme') || 'dark';
  document.body.classList.toggle('theme-light', savedTheme === 'light');
  if(headerThemeToggle) {
      headerThemeToggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';
      headerThemeToggle.addEventListener('click', () => {
        const nowLight = !document.body.classList.contains('theme-light');
        document.body.classList.toggle('theme-light', nowLight);
        localStorage.setItem('rushradar_theme', nowLight ? 'light' : 'dark');
        headerThemeToggle.textContent = nowLight ? '🌙' : '☀️';
      });
  }

  // --- MAP LOGIC ---
  function initializeMap() {
    console.log('Initializing map...');
    const mapEl = document.getElementById('map');
    
    if (!mapEl) {
      console.error('CRITICAL: Map container #map not found in DOM.');
      return;
    }

    // Initialize Leaflet
    // We use a slight timeout to ensure the container has computed height from CSS
    setTimeout(() => {
        try {
            const center = [(startCoords[0] + endCoords[0]) / 2, (startCoords[1] + endCoords[1]) / 2];
            map = L.map('map').setView(center, 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);

            // Markers
            L.marker(startCoords).addTo(map).bindPopup('Whitefield').openPopup();
            L.marker(endCoords).addTo(map).bindPopup('Marathahalli');

            // Route Line
            routeLayer = L.polyline([startCoords, endCoords], { 
                color: '#888', // Start grey
                weight: 8, 
                opacity: 0.9 
            }).addTo(map);
            
            // Force map to recalculate size after render
            map.invalidateSize();
            console.log('Map initialized successfully.');

            // Trigger first prediction
            handleRangeChange();

        } catch (error) {
            console.error('Error during map creation:', error);
        }
    }, 100);
  }

  function updateMapColor(classification) {
    if (!routeLayer) return;
    
    let color = '#888'; // Default Grey
    if (classification === 'Light') color = '#22c55e'; // Green
    if (classification === 'Normal') color = '#facc15'; // Yellow
    if (classification === 'Heavy') color = '#ef4444'; // Red
    if (classification === 'Extreme') color = '#b91c1c'; // Dark Red

    routeLayer.setStyle({ color: color });
  }

  // --- API & ORCHESTRATION ---
  
  let selectedRange = '15min';

  function createRangeButtons() {
    const renderBtns = (list, container, type) => {
        if(!container) return;
        container.innerHTML = '';
        list.forEach(r => {
            const btn = document.createElement('button');
            btn.textContent = r.label;
            btn.addEventListener('click', () => {
                selectedRange = r.id;
                updateUIState();
                handleRangeChange();
            });
            container.appendChild(btn);
        });
    };

    renderBtns(predictionRanges.shortTerm, shortRangeEl, 'short');
    renderBtns(predictionRanges.longTerm, longRangeEl, 'long');
    updateUIState();
  }

  function updateUIState() {
    // Update active classes for buttons
    const allBtns = document.querySelectorAll('.stack button');
    allBtns.forEach(b => b.classList.remove('active', 'short', 'long'));

    // Find the current active button text
    const allRanges = [...predictionRanges.shortTerm, ...predictionRanges.longTerm];
    const activeObj = allRanges.find(r => r.id === selectedRange);
    
    if(activeObj) {
        if(selectedLabelEl) selectedLabelEl.textContent = activeObj.label;
        // Highlight the specific button clicked
        // (Simple text matching for demo purposes)
        allBtns.forEach(b => {
            if(b.textContent === activeObj.label) {
                b.classList.add('active', predictionRanges.shortTerm.includes(activeObj) ? 'short' : 'long');
            }
        });
    }
  }

  async function handleRangeChange() {
    const isShortTerm = predictionRanges.shortTerm.some(r => r.id === selectedRange);
    const chartCard = document.querySelector('.chart-card');

    if (isShortTerm) {
        // --- SHORT TERM MODE ---
        console.log(`Short-term mode: ${selectedRange}`);
        if(chartCard) chartCard.style.display = 'none'; // Hide chart
        updateShortTermStats({ predicted_total_traffic: '...', traffic_classification: '...' });
        
        // 1. Fetch Data
        const prediction = await getTrafficPrediction(selectedRange);
        
        // 2. Update UI
        updateShortTermStats(prediction);
        if(prediction) updateMapColor(prediction.traffic_classification);
        else updateMapColor(null); // Reset to grey on error

    } else {
        // --- LONG TERM MODE ---
        console.log(`Long-term mode: ${selectedRange}`);
        if(chartCard) chartCard.style.display = 'block'; // Show chart
        updateMapColor(null); // Map turns grey for long term (design choice)
        updateLongTermStats(null, selectedRange, "Loading...");

        // 1. Fetch Data
        const trendData = await getTrafficTrend(selectedRange);

        // 2. Update UI
        if (trendData && trendData.daily) {
            updateLongTermStats(trendData, selectedRange);
            drawTrendChart(trendData.daily);
        }
    }
  }

  // --- DATA FETCHING (Helper functions) ---

  async function fetchRecentData() {
    try {
      const response = await fetch(`${baseUrl}/api/get-recent-data`);
      if (!response.ok) throw new Error('Backend error');
      return await response.json();
    } catch (error) {
      console.error('Fetch Recent Data Error:', error);
      return null;
    }
  }

  async function getTrafficPrediction(horizon) {
    const recentData = await fetchRecentData();
    if (!recentData || recentData.length < 48) {
        console.warn('Insufficient data for prediction');
        return null;
    }
    try {
      const res = await fetch(`${baseUrl}/api/predict?horizon=${horizon}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recent_data: recentData })
      });
      return await res.json();
    } catch (e) { return null; }
  }

  function getTrendDates(rangeId) {
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() + 1);
    const end = new Date(start);
    
    if (rangeId === 'weekly') end.setDate(start.getDate() + 6);
    if (rangeId === 'monthly') end.setDate(start.getDate() + 29);
    
    return { 
        start: start.toISOString().split('T')[0], 
        end: end.toISOString().split('T')[0] 
    };
  }

  async function getTrafficTrend(rangeId) {
    const { start, end } = getTrendDates(rangeId);
    try {
        const res = await fetch(`${baseUrl}/api/trends?start=${start}&end=${end}`);
        return await res.json();
    } catch (e) { return null; }
  }

  // --- STATS UPDATING ---
  function updateShortTermStats(pred, err) {
     if(err || !pred) {
         if(countEl) countEl.textContent = 'N/A';
         if(classEl) classEl.textContent = 'Error';
         return;
     }
     if(countEl) countEl.textContent = Math.round(pred.predicted_total_traffic || 0);
     if(classEl) classEl.textContent = pred.traffic_classification || 'N/A';
     if(peakLabelEl) peakLabelEl.textContent = 'Peak Hours';
     if(peakEl) peakEl.textContent = '7-10 AM & 5-8 PM';
  }

  function updateLongTermStats(data, rangeId, msg) {
      if(msg) {
          if(classEl) classEl.textContent = msg;
          if(countEl) countEl.textContent = '...';
          return;
      }
      let avg = 0;
      let label = "Avg. Traffic";
      const dataset = data.daily || [];
      if(dataset.length > 0) {
          avg = dataset.reduce((a, b) => a + (b.Predicted_Traffic || 0), 0) / dataset.length;
      }
      if(countEl) countEl.textContent = Math.round(avg);
      if(classEl) classEl.textContent = label;
      if(peakLabelEl) peakLabelEl.textContent = 'Forecast Days';
      if(peakEl) peakEl.textContent = dataset.length;
  }

  function drawTrendChart(data) {
      if(!chartEl) return;
      const ctx = chartEl.getContext('2d');
      if(trendChart) trendChart.destroy();

      trendChart = new Chart(ctx, {
          type: 'line',
          data: {
              labels: data.map(d => d.Date),
              datasets: [{
                  label: 'Traffic Trend',
                  data: data.map(d => d.Predicted_Traffic),
                  borderColor: '#3b82f6',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  fill: true,
                  tension: 0.3
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                  x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                  y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
              },
              plugins: { legend: { labels: { color: '#e5e7eb' } } }
          }
      });
  }

  // --- STARTUP ---
  document.addEventListener('DOMContentLoaded', () => {
      createRangeButtons();
      initializeMap();
  });

})();