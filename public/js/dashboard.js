// Dashboard logic: map generation, controls, and API connection
(async function () {
  const baseUrl='http://127.0.0.1:5000';
  // Using Leaflet for maps — no API key required. Backend still exposes `/api/config` if needed.
 
  // Coordinates for Whitefield (start) and Marathahalli (end) in [lat, lng] for Leaflet
  const startCoords = [12.9698, 77.7497];
  const endCoords = [12.9569, 77.6963];
  
  let map;
  let trendChart; // Variable to hold the chart object

  // Prediction ranges
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
  
  // DOM elements
  const shortRangeEl = document.getElementById('shortRange');
  const longRangeEl = document.getElementById('longRange');
  const selectedLabelEl = document.getElementById('selectedLabel');
  const logoutBtn = document.getElementById('logoutBtn');
  const headerThemeToggle = document.getElementById('headerThemeToggle');
  const chartEl = document.getElementById('trendChart'); 

  // Stat card elements
  const countEl = document.getElementById('predictedCount');
  const classEl = document.getElementById('trafficClassification');
  const peakEl = document.getElementById('peakHours');
  const peakLabelEl = document.getElementById('peakHoursLabel'); // Now this ID exists in the HTML

  // Theme toggle
  const savedTheme = localStorage.getItem('rushradar_theme') || 'dark';
  document.body.classList.toggle('theme-light', savedTheme === 'light');
  headerThemeToggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';
  headerThemeToggle.addEventListener('click', () => {
    const nowLight = !document.body.classList.contains('theme-light');
    document.body.classList.toggle('theme-light', nowLight);
    localStorage.setItem('rushradar_theme', nowLight ? 'light' : 'dark');
    headerThemeToggle.textContent = nowLight ? '🌙' : '☀️';
  });

  // NOTE: login removed — dashboard is public by default. Logout button left as UI element but does not redirect.

  // Render range buttons
  let selectedRange = '15min';
  function createRangeButtons() {
    shortRangeEl.innerHTML = '';
    longRangeEl.innerHTML = '';

    predictionRanges.shortTerm.forEach(r => {
      const btn = document.createElement('button');
      btn.textContent = r.label;
      btn.className = 'range-btn';
      btn.addEventListener('click', () => {
        selectedRange = r.id;
        updateSelectedRange();
        handleRangeChange(); // Call new orchestrator
      });
      if (r.id === selectedRange) btn.classList.add('active', 'short');
      shortRangeEl.appendChild(btn);
    });

    predictionRanges.longTerm.forEach(r => {
      const btn = document.createElement('button');
      btn.textContent = r.label;
      btn.className = 'range-btn';
      btn.addEventListener('click', () => {
        selectedRange = r.id;
        updateSelectedRange();
        handleRangeChange(); // Call new orchestrator
      });
      if (r.id === selectedRange) btn.classList.add('active', 'long');
      longRangeEl.appendChild(btn);
    });

    updateSelectedRange();
  }

  function updateSelectedRange() {
    // Update label
    const all = predictionRanges.shortTerm.concat(predictionRanges.longTerm);
    const found = all.find(r => r.id === selectedRange);
    
    if (selectedLabelEl) {
        selectedLabelEl.textContent = found ? found.label : selectedRange;
    }

    // set active classes
    if (shortRangeEl) {
        shortRangeEl.querySelectorAll('button').forEach(b => b.classList.remove('active', 'short'));
        Array.from(shortRangeEl.children).forEach(btn => {
            if (found && btn.textContent === found.label) btn.classList.add('active', 'short');
        });
    }
    if (longRangeEl) {
        longRangeEl.querySelectorAll('button').forEach(b => b.classList.remove('active', 'long'));
        Array.from(longRangeEl.children).forEach(btn => {
            if (found && btn.textContent === found.label) btn.classList.add('active', 'long');
        });
    }
  }
  
  // --- START: API AND STATS LOGIC ---

  async function fetchRecentData() {
    console.log("Fetching recent data from backend...");
    try {
      const response = await fetch(`${baseUrl}/api/get-recent-data`);
      if (!response.ok) {
        const err = await response.json();
        console.error('Failed to fetch recent data:', err.error);
        console.warn("--- WARNING: `${baseUrl}/api/get-recent-data` FAILED. ---");
        return null;
      }
      const data = await response.json();
      return data; // This should be an array of at least 48 objects
    } catch (error) {
      console.error('Error fetching recent data:', error);
      return null;
    }
  }

  async function getTrafficPrediction(horizonToPredict) {
    const recentData = await fetchRecentData(); 
    const SEQ_LENGTH = 48; // From your LSTM training script

    if (!recentData || recentData.length < SEQ_LENGTH) {
      console.error(`Not enough data for prediction. Need ${SEQ_LENGTH}, got ${recentData ? recentData.length : 0}.`);
      updateShortTermStats(null, "Error: Not enough data from server.");
      return null;
    }

    try {
      const response = await fetch(`${baseUrl}/api/predict?horizon=${horizonToPredict}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recent_data: recentData // This key MUST match your app.py
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('Prediction received:', result);
        return result; // Success!
      } else {
        console.error('Prediction failed:', result.error);
        updateShortTermStats(null, result.error); 
        return null; // API error
      }
    } catch (error) {
      console.error('Error connecting to API:', error);
      updateShortTermStats(null, "Network Error"); 
      return null; // Network error
    }
  }

  function getTrendDates(rangeId) {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() + 1); // Start from tomorrow
    
    const end = new Date(start);
    
    if (rangeId === 'nextday') {
      end.setDate(start.getDate()); // End date is same as start date
    } else if (rangeId === 'weekly') {
      end.setDate(start.getDate() + 6); // 7 days total
    } else if (rangeId === 'monthly') {
      end.setDate(start.getDate() + 29); // 30 days total
    }
    
    const formatDate = (d) => d.toISOString().split('T')[0];
    
    return { start: formatDate(start), end: formatDate(end) };
  }

  async function getTrafficTrend(rangeId) {
    const { start, end } = getTrendDates(rangeId);
    
    console.log(`Fetching trends for ${rangeId} from ${start} to ${end}`);
    
    try {
      const response = await fetch(`${baseUrl}/api/trends?start=${start}&end=${end}`);
      const result = await response.json();
      
      if (response.ok) {
        console.log('Trend data received:', result);
        return result; // Success!
      } else {
        console.error('Trend fetch failed:', result.error);
        updateLongTermStats(null, rangeId, result.error); 
        return null;
      }
    } catch (error) {
      console.error('Error connecting to Trend API:', error);
      updateLongTermStats(null, rangeId, "Network Error"); 
      return null;
    }
  }

  function updateShortTermStats(prediction, error = null) {
    if (error) {
      if(countEl) countEl.textContent = 'N/A';
      if(classEl) classEl.textContent = error;
      if(peakEl) peakEl.textContent = '...';
      if(peakLabelEl) peakLabelEl.textContent = 'Peak Hours';
      return;
    }
    
    if (prediction && prediction.predicted_total_traffic !== undefined) {
      if(countEl) countEl.textContent = Math.round(prediction.predicted_total_traffic);
      if(classEl) classEl.textContent = prediction.traffic_classification;
      if(peakEl) peakEl.textContent = '7-10 AM & 5-8 PM'; // Restore hardcoded value
      if(peakLabelEl) peakLabelEl.textContent = 'Peak Hours';
    } else {
      if(countEl) countEl.textContent = 'N/A';
      if(classEl) classEl.textContent = 'No Data';
      if(peakEl) peakEl.textContent = '...';
      if(peakLabelEl) peakLabelEl.textContent = 'Peak Hours';
    }
  }

  function updateLongTermStats(trendData, rangeId, error = null) {
    if (error) {
      if(countEl) countEl.textContent = 'N/A';
      if(classEl) classEl.textContent = error;
      if(peakEl) peakEl.textContent = '...';
      if(peakLabelEl) peakLabelEl.textContent = 'Data Points';
      return;
    }

    if (!trendData || !trendData.daily) {
      if(countEl) countEl.textContent = 'N/A';
      if(classEl) classEl.textContent = 'No Data';
      if(peakEl) peakEl.textContent = '...';
      if(peakLabelEl) peakLabelEl.textContent = 'Data Points';
      return;
    }

    let dataToShow = [];
    let label = "Avg. Daily";
    
    if (rangeId === 'nextday' && trendData.daily) {
      dataToShow = trendData.daily;
      label = "Next Day";
    } else if (rangeId === 'weekly' && trendData.weekly) {
      dataToShow = trendData.weekly;
      label = "Avg. Weekly";
    } else if (rangeId === 'monthly' && trendData.monthly) {
      dataToShow = trendData.monthly;
      label = "Avg. Monthly";
    } else if (trendData.daily) {
      dataToShow = trendData.daily;
      label = "Avg. Daily";
    }

    let avg = 0;
    if (dataToShow.length > 0) {
      const sum = dataToShow.reduce((acc, val) => acc + (val.Predicted_Traffic || 0), 0);
      avg = sum / dataToShow.length;
    }
    
    if(countEl) countEl.textContent = Math.round(avg);
    if(classEl) classEl.textContent = label;
    if(peakEl) peakEl.textContent = `${trendData.daily.length} Days`;
    if(peakLabelEl) peakLabelEl.textContent = 'Forecast';
  }

  function drawTrendChart(dailyData) {
    if (!chartEl) {
      console.warn("Chart canvas with id 'trendChart' not found.");
      return;
    }
    
    const chartLabels = dailyData.map(d => new Date(d.Date));
    const chartData = dailyData.map(d => d.Predicted_Traffic);

    if (trendChart) {
      trendChart.destroy();
    }

    trendChart = new Chart(chartEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'Predicted Daily Traffic',
          data: chartData,
          borderColor: '#3b82f6', // Blue
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'day',
              tooltipFormat: 'MMM d, yyyy'
            },
            title: {
              display: true,
              text: 'Date'
            },
            ticks: {
                color: '#9ca3af' 
            }
          },
          y: {
            title: {
              display: true,
              text: 'Traffic Volume'
            },
            ticks: {
                color: '#9ca3af'
            }
          }
        },
        plugins: {
            legend: {
                labels: {
                    color: '#e5e7eb'
                }
            }
        }
      }
    });
  }

  // --- END: API AND STATS LOGIC ---


  // --- START: LEAFLET MAP LOGIC ---

  let routeLayer = null; // Leaflet polyline layer

  function initializeMap() {
    // Create the Leaflet map centered between start and end
    const center = [(startCoords[0] + endCoords[0]) / 2, (startCoords[1] + endCoords[1]) / 2];
    map = L.map('map', { zoomControl: true }).setView(center, 13);

    // Use a dark tile layer for contrast
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    // Add start/end markers
    L.marker(startCoords, { title: 'Whitefield', riseOnHover: true }).addTo(map).bindPopup('Whitefield');
    L.marker(endCoords, { title: 'Marathahalli', riseOnHover: true }).addTo(map).bindPopup('Marathahalli');

    // Draw a simple straight route polyline between start and end
    routeLayer = L.polyline([startCoords, endCoords], { color: '#888', weight: 8, opacity: 0.9 }).addTo(map);

    // Initial prediction once map exists
    handleRangeChange();
  }

  function updateMapColor(classification) {
    let color = '#888'; // Default grey

    switch (classification) {
      case 'Light':
        color = '#22c55e'; // Green
        break;
      case 'Normal':
        color = '#facc15'; // Yellow
        break;
      case 'Heavy':
        color = '#ef4444'; // Red
        break;
      case 'Extreme':
        color = '#b91c1c'; // Dark Red
        break;
    }

    if (routeLayer) {
      routeLayer.setStyle({ color: color });
    }
  }

  // --- END: LEAFLET MAP LOGIC ---


  // --- MAIN ORCHESTRATION FUNCTION (NEW) ---
  
  async function handleRangeChange() {
    const shortTermIds = predictionRanges.shortTerm.map(r => r.id);
    const longTermIds = predictionRanges.longTerm.map(r => r.id);
    
    const chartContainer = chartEl ? chartEl.closest('.chart-card') : null;

    if (shortTermIds.includes(selectedRange)) {
      console.log(`Handling short-term range: ${selectedRange}`);
      
      if(chartContainer) chartContainer.style.display = 'none';
      updateShortTermStats({ predicted_total_traffic: '...', traffic_classification: '...' });
      updateMapColor(null); // Reset map color

      const prediction = await getTrafficPrediction(selectedRange);

      updateShortTermStats(prediction);
      if (prediction) {
        updateMapColor(prediction.traffic_classification);
      }

    } else if (longTermIds.includes(selectedRange)) {
      console.log(`Handling long-term range: ${selectedRange}`);
      
      if(chartContainer) chartContainer.style.display = 'block';
      updateMapColor(null); // No classification for long-term
      updateLongTermStats(null, selectedRange, "Loading..."); // Show loading

      const trendData = await getTrafficTrend(selectedRange);
      
      if (trendData && trendData.daily) {
        updateLongTermStats(trendData, selectedRange);
        drawTrendChart(trendData.daily);
      } else {
        if (trendChart) trendChart.destroy(); // Clear chart on error
      }
    }
  }

  // --- INITIALIZATION ---
  createRangeButtons();
  initializeMap(); // This will call handleRangeChange() once the map is loaded

})();
