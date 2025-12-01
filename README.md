# TrafficFlow — Frontend (RushRadar Dashboard)

A lightweight, responsive dashboard UI for the TrafficFlow project.  
This frontend displays a Mapbox route, short-term traffic predictions (LSTM), and long-term trends (ensemble). It fetches configuration and prediction data from the backend API and renders charts and map visualizations.

---

## Key Features
- Interactive Mapbox map showing route and markers
- Short-term traffic predictions (15min / 1hr / 2hr / 3hr)
- Long-term trend charts (next day / weekly / monthly)
- Theme toggle (light / dark)
- Simple stat cards (predicted count, classification, peak info)
- Clean, modular code in `js/dashboard.js`

---

## Project Structure
- css/
  - styles.css — main stylesheet
- js/
  - dashboard.js — main dashboard logic (map, API calls, UI updates)
  - login.js — simple login handling
- public/
  - dashboard.html — dashboard page
  - index.html — login page
- src/ (placeholder for React/Vite scaffolding, not required)
- README.md — this file

---

## Important DOM IDs (used by dashboard.js)
Ensure these elements exist in `dashboard.html`:
- `map` — map container
- `shortRange`, `longRange` — range button containers
- `selectedLabel` — shows currently selected range label
- `trendChart` — canvas for the Chart.js trend chart
- `predictedCount`, `trafficClassification`, `peakHours`, `peakHoursLabel` — stat cards
- `logoutBtn`, `headerThemeToggle` — header controls

---

## Prerequisites
- A running backend at `http://127.0.0.1:5000` (serves `/api/config`, `/api/predict`, `/api/trends`, `/api/get-recent-data`)
- Mapbox API token stored in backend `.env` as `MY_API_KEY` (frontend fetches it from `/api/config`)
- Browser with JS enabled

External libraries (must be included in HTML):
- Mapbox GL JS (mapboxgl)
- Chart.js (Chart)
You can use CDN links in `dashboard.html` or host locally.

Suggested CDN versions:
- mapbox-gl >= 2.x
- chart.js >= 3.x

---

## Run (development) — Windows
1. Start backend (from `backend/`):
   - Activate your virtualenv, then:
     python app.py
   - Confirm `http://127.0.0.1:5000/api/config` returns `{"api_key":"..."}`

2. Serve frontend (do NOT open `file://` directly):
   - Option A — VS Code Live Server extension (recommended).
   - Option B — Simple HTTP server from the frontend folder:
     - Open PowerShell in `c:\Users\ASUS\Desktop\trafficflow\frontend` and run:
       python -m http.server 5500
     - Open http://127.0.0.1:5500/public/dashboard.html

3. Open browser DevTools:
   - Check Console for "Fetched API Key from backend"
   - Check Network tab for API calls and Mapbox directions request

---

## Configuration Notes
- The Mapbox key is provided by the backend endpoint `/api/config`. If you prefer, you can temporarily hardcode the key in `js/dashboard.js` while debugging.
- Ensure backend CORS is enabled (Flask-CORS) so the frontend origin can call the API.

---

## Troubleshooting
- Blank map / 401 from Mapbox:
  - Confirm backend `.env` has `MY_API_KEY` and Flask is restarted.
  - Check Console and Network logs for token errors.
- `fetch` to backend failing:
  - Confirm backend URL and port.
  - If serving frontend from a different origin, ensure Flask-CORS allows it.
- Elements missing / errors in `dashboard.js`:
  - Verify the HTML contains the IDs listed above and that script tags load after DOM or the script runs after DOM ready.
- "file:///" page issues:
  - Many browsers block fetch/XHR from file://. Always use HTTP server.

---

## Development Tips
- Keep Mapbox and Chart.js script tags before `js/dashboard.js`.
- The dashboard is written to be modular — API endpoints expected:
  - GET `/api/config` → { "api_key": "..." }
  - GET `/api/get-recent-data` → recent short-term data array
  - POST `/api/predict?horizon=15min|1hr|2hr|3hr` with JSON { recent_data: [...] }
  - GET `/api/trends?start=YYYY-MM-DD&end=YYYY-MM-DD`

---

## Contribution
- Create PRs against the `frontend` folder.
- Keep UI and logic separated: modify CSS in `css/styles.css`, behavior in `js/*.js`.

---

## License
- See project root for license information.

Thank you — open an issue or attach console logs if you need help debugging specific frontend errors.