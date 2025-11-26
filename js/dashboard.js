// Dashboard logic: map generation, controls, and API connection
(async function () {
  
  // **** ADD YOUR MAPBOX KEY ****
  let MAPBOX_API_KEY = "YOUR_MAPBOX_API_KEY_HERE";

  // Fetch Mapbox API key from backend before anything else
  try {
    const response = await fetch('http://127.0.0.1:5000/api/config');
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch API key: ${response.status} ${text}`);
    }
    const data = await response.json();
    if (data && data.api_key) {
      MAPBOX_API_KEY = data.api_key;
      console.log("Fetched API Key from backend");
    } else {
      console.warn("Backend returned no api_key; using default placeholder.");
    }
  } catch (error) {
    console.error('Error fetching Mapbox API key from backend. Using default key.', error);
  }

  // Coordinates for Whitefield (start) and Marathahalli (end)
  const startCoords = [77.7497, 12.9698]; 
  const endCoords = [77.6963, 12.9569];
  
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

  /**
   * Fetches the most recent data from the backend.
   */
  async function fetchRecentData() {
    console.log("Fetching recent data from backend...");
    try {
      // THIS ENDPOINT NEEDS TO BE CREATED IN YOUR FLASK APP
      const response = await fetch('http://127.0.0.1:5000/api/get-recent-data');
      if (!response.ok) {
        const err = await response.json();
        console.error('Failed to fetch recent data:', err.error);
        console.warn("--- WARNING: '/api/get-recent-data' FAILED. ---");
        return null;
      }
      const data = await response.json();
      return data; // This should be an array of at least 48 objects
    } catch (error) {
      console.error('Error fetching recent data:', error);
      return null;
    }
  }


  /**
   * Calls the SHORT-TERM backend API to get a traffic prediction.
   * @param {string} horizonToPredict - One of '15min', '1hr', '2hr', '3hr'
   * @returns {Promise<object|null>} The prediction result or null on error.
   */
  async function getTrafficPrediction(horizonToPredict) {
    // 1. Get your recent data.
    const recentData = await fetchRecentData(); 
    const SEQ_LENGTH = 48; // From your LSTM training script

    if (!recentData || recentData.length < SEQ_LENGTH) {
      console.error(`Not enough data for prediction. Need ${SEQ_LENGTH}, got ${recentData ? recentData.length : 0}.`);
      updateShortTermStats(null, "Error: Not enough data from server.");
      return null;
    }

    // 2. Call the API
    try {
      // Calls /api/predict?horizon=...
      const response = await fetch(`http://127.0.0.1:5000/api/predict?horizon=${horizonToPredict}`, {
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

  /**
   * Helper function to get start/end dates for the trend API.
   */
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

  /**
   * Calls the LONG-TERM backend API to get traffic trends.
   * @param {string} rangeId - One of 'nextday', 'weekly', 'monthly'
   * @returns {Promise<object|null>} The trend data or null on error.
   */
  async function getTrafficTrend(rangeId) {
    const { start, end } = getTrendDates(rangeId);
    
    console.log(`Fetching trends for ${rangeId} from ${start} to ${end}`);
    
    try {
      // Calls /api/trends?start=...&end=...
      const response = await fetch(`http://127.0.0.1:5000/api/trends?start=${start}&end=${end}`);
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

  /**
   * Updates the stats cards for a SHORT-TERM prediction.
   */
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

  /**
   * Updates the stats cards for a LONG-TERM trend.
   */
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

  /**
   * Draws the long-term trend chart using Chart.js.
   */
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


  // --- START: MAPBOX LOGIC (Unchanged) ---
  
  function initializeMap() {
    // If Mapbox key is present, initialize Mapbox GL; otherwise fallback to Leaflet+OSM
    if (MAPBOX_API_KEY && !MAPBOX_API_KEY.includes("YOUR_MAPBOX_API_KEY")) {
      mapboxgl.accessToken = MAPBOX_API_KEY;
      map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: startCoords,
        zoom: 12
      });

      map.on('load', async () => {
        const routeGeoJSON = await getRoute(startCoords, endCoords);
        if (routeGeoJSON) {
          addRouteLayer(routeGeoJSON);
        }

        new mapboxgl.Marker({ color: '#22c55e' }).setLngLat(startCoords).setPopup(new mapboxgl.Popup().setHTML("Whitefield")).addTo(map);
        new mapboxgl.Marker({ color: '#ef4444' }).setLngLat(endCoords).setPopup(new mapboxgl.Popup().setHTML("Marathahalli")).addTo(map);

        // Run the first prediction after the map is fully loaded
        handleRangeChange(); 
      });

    } else {
      console.warn("Mapbox API key not found — using Leaflet + OpenStreetMap fallback.");

      // Initialize Leaflet map (fallback)
      try {
        const leafletMap = L.map('map').setView([startCoords[1], startCoords[0]], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(leafletMap);

        // Add markers
        L.marker([startCoords[1], startCoords[0]], {title: 'Whitefield'}).addTo(leafletMap).bindPopup('Whitefield');
        L.marker([endCoords[1], endCoords[0]], {title: 'Marathahalli'}).addTo(leafletMap).bindPopup('Marathahalli');

        // Draw simple straight line between points as a fallback route
        const latlngs = [ [startCoords[1], startCoords[0]], [endCoords[1], endCoords[0]] ];
        L.polyline(latlngs, {color: '#888', weight: 6}).addTo(leafletMap);

        // Expose a minimal `map` object with setPaintProperty behavior used elsewhere
        map = {
          _leaflet: leafletMap,
          getLayer: () => true,
          setPaintProperty: (layer, prop, value) => {
            // change polyline color when asked
            if (prop === 'line-color') {
              leafletMap.eachLayer(function (l) {
                if (l instanceof L.Polyline) {
                  l.setStyle({ color: value });
                }
              });
            }
          }
        };

        // Run the first prediction after the map is ready
        handleRangeChange();

      } catch (e) {
        console.error('Leaflet initialization failed:', e);
      }
    }
  }

  async function getRoute(start, end) {
    console.log("Fetching route from Mapbox...");
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start.join(',')};${end.join(',')}` +
                `?geometries=geojson&access_token=${MAPBOX_API_KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes && data.routes.length) {
        return data.routes[0].geometry;
      }
    } catch (e) {
      console.error("Error fetching route:", e);
    }
    return null;
  }

  function addRouteLayer(routeGeoJSON) {
    map.addSource('route', {
      'type': 'geojson',
      'data': {
        'type': 'Feature',
        'geometry': routeGeoJSON
      }
    });
    
    map.addLayer({
      'id': 'route-layer',
      'type': 'line',
      'source': 'route',
      'layout': {
        'line-join': 'round',
        'line-cap': 'round'
      },
      'paint': {
        'line-color': '#888',
        'line-width': 8
      }
    });
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
    
    if (map && map.getLayer('route-layer')) {
      map.setPaintProperty('route-layer', 'line-color', color);
    }
  }

  // --- END: MAPBOX LOGIC ---


  // --- MAIN ORCHESTRATION FUNCTION (NEW) ---
  
  /**
   * Main orchestrator function called when a range button is clicked.
   * Decides whether to call the short-term or long-term API.
   */
  async function handleRangeChange() {
    const shortTermIds = predictionRanges.shortTerm.map(r => r.id);
    const longTermIds = predictionRanges.longTerm.map(r => r.id);
    
    // Show chart canvas for long-term, hide for short-term
    const chartContainer = chartEl ? chartEl.closest('.chart-card') : null;

    if (shortTermIds.includes(selectedRange)) {
      // --- SHORT TERM LOGIC ---
      console.log(`Handling short-term range: ${selectedRange}`);
      
      // Hide chart, show loading stats
      if(chartContainer) chartContainer.style.display = 'none';
      updateShortTermStats({ predicted_total_traffic: '...', traffic_classification: '...' });
      updateMapColor(null); // Reset map color

      // Call API
      const prediction = await getTrafficPrediction(selectedRange);

      // Update UI
      updateShortTermStats(prediction);
      if (prediction) {
        updateMapColor(prediction.traffic_classification);
      }

    } else if (longTermIds.includes(selectedRange)) {
      // --- LONG TERM LOGIC ---
      console.log(`Handling long-term range: ${selectedRange}`);
      
      // Show chart container, reset map, show loading stats
      if(chartContainer) chartContainer.style.display = 'block';
      updateMapColor(null); // No classification for long-term
      updateLongTermStats(null, selectedRange, "Loading..."); // Show loading

      // Call API
      const trendData = await getTrafficTrend(selectedRange);
      
      // Update UI
      if (trendData && trendData.daily) {
        updateLongTermStats(trendData, selectedRange);
        drawTrendChart(trendData.daily);
      } else {
        // Error is already handled inside getTrafficTrend
        if (trendChart) trendChart.destroy(); // Clear chart on error
      }
    }
  }

  // --- INITIALIZATION ---
  createRangeButtons();
  initializeMap(); // This will call handleRangeChange() once the map is loaded

})();