# RoadSafe AI — Troubleshooting Guide

## 🔴 Issue: Button Disappears When Clicking "Simulate Crash"

### **Root Cause**
The button was hidden when `mode === "crash"` but there was no way to cancel or go back.

### **Fix Applied** ✅
- Added a **Cancel button** in the loading state
- Button reappears if you cancel or if an error occurs
- Demo mode fallback always provides a working emergency state

---

## 🔴 Issue: 502 Bad Gateway Error

### **Root Cause**
**Duplicate `get_emergency_route()` function** in `routing.py` caused Python syntax error.

### **Fix Applied** ✅
- Removed duplicate function definition
- Backend should now start without errors

### **How to Verify:**
```bash
# Restart backend
cd Routiq/backend
venv\Scripts\activate
uvicorn app.main:app --reload
```

**You should see:**
```
INFO:     Application startup complete.
[main] providers: groq=... sarvam=...
```

**NOT:**
```
ERROR:     Exception in ASGI application
SyntaxError: duplicate function definition
```

---

## 🔴 Issue: Live Location Not Showing

### **Possible Causes:**
1. **Browser permission denied**
2. **HTTPS required** (geolocation doesn't work on HTTP in most browsers)
3. **Browser doesn't support geolocation**
4. **Geolocation service timeout**

### **Fix Applied** ✅
- Added **location status indicator** in Emergency page
- Shows yellow warning if location access is denied
- Explains how to fix it
- Demo mode automatically falls back to Mumbai coordinates

### **How to Enable Location Access:**

#### Chrome:
1. Click the lock icon (🔒) in address bar
2. Find "Location" permission
3. Change to "Allow"
4. Refresh the page

#### Firefox:
1. Click the lock icon in address bar
2. Click "Connection secure" → "More information"
3. Go to "Permissions" tab
4. Find "Access Your Location"
5. Uncheck "Use Default" and check "Allow"
6. Refresh the page

#### Edge:
1. Click the lock icon in address bar
2. Click "Permissions for this site"
3. Find "Location"
4. Change to "Allow"
5. Refresh the page

### **Alternative: Use DEV_LOCATION Override**

Edit `frontend/src/config.ts`:

```typescript
// Uncomment and set your location for testing
export const DEV_LOCATION: { lat: number; lon: number } | null = {
  lat: 19.0760,  // Your latitude
  lon: 72.8777,  // Your longitude
};
```

This overrides the GPS and lets you test without browser location permission.

---

## 🔴 Issue: Dashboard Route Returns 502

### **Possible Causes:**
1. Backend crashed due to duplicate function (now fixed)
2. OSRM public server is down/slow
3. Network timeout

### **Fix Applied** ✅
- Removed duplicate function causing crash

### **If Still Occurring:**

**Check backend logs:**
```bash
# Look for Python errors in the terminal running uvicorn
```

**Common errors:**
- `ModuleNotFoundError` → Missing dependency, run `pip install -r requirements.txt`
- `OSRM timeout` → Public server is slow, try again or self-host
- `ImportError` → Python version mismatch, ensure Python 3.8+

---

## 🟡 Performance Still Slow?

### **Expected Times After Fix:**
- ✅ Emergency activation: **2-6 seconds** (first time)
- ✅ Emergency cached: **<4 seconds** (repeat in same area)
- ✅ Dashboard routing: **2-5 seconds**

### **If Slower Than Expected:**

#### 1. Check Network
```bash
# Test OSRM directly
curl "https://router.project-osrm.org/route/v1/driving/72.8777,19.0760;72.8295,19.0596?overview=false"
```

Should respond in <3 seconds. If slower, public OSRM is overloaded.

#### 2. Check Cache Hits
Look in backend logs for:
```
[overpass] cache hit for 19.08,72.88,15.0 (12 hospitals)
```

If you don't see cache hits on repeat activations, cache isn't working.

#### 3. Self-Host OSRM (Best Solution)
See `EMERGENCY_PERFORMANCE_FIX.md` for detailed instructions.

**Quick version:**
```bash
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/india-latest.osm.pbf
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/india-latest.osrm
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/india-latest.osrm
docker run -t -i -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/india-latest.osrm
```

Then update `backend/.env`:
```
OSRM_URL=http://localhost:5000
```

---

## 🟢 Health Check Commands

### **Backend Health:**
```bash
curl http://127.0.0.1:8000/api/health
```

Should return:
```json
{
  "status": "ok",
  "service": "roadsafe-ai-backend",
  "uptime_s": 123.4,
  "providers": { ... }
}
```

### **Frontend Health:**
Open browser console and run:
```javascript
fetch('/api/health').then(r => r.json()).then(console.log)
```

### **Emergency Endpoint Test:**
```bash
curl -X POST http://127.0.0.1:8000/api/emergency/activate \
  -H "Content-Type: application/json" \
  -d '{"lat": 19.0760, "lon": 72.8777}'
```

Should return hospitals within 2-6 seconds.

---

## 🛠️ Reset Everything

If all else fails:

### **1. Restart Backend:**
```bash
# Kill existing process (Ctrl+C in terminal)
cd Routiq/backend
venv\Scripts\activate
pip install -r requirements.txt  # Reinstall dependencies
uvicorn app.main:app --reload
```

### **2. Restart Frontend:**
```bash
# Kill existing process (Ctrl+C in terminal)
cd Routiq/frontend
npm install  # Reinstall dependencies
npm run dev
```

### **3. Clear Browser Cache:**
- Chrome: Ctrl+Shift+Delete → Clear cache
- Firefox: Ctrl+Shift+Delete → Clear cache
- Edge: Ctrl+Shift+Delete → Clear cache

### **4. Hard Refresh:**
- Windows: Ctrl+Shift+R
- Mac: Cmd+Shift+R

---

## 📊 Verify Fix Worked

### **Emergency Navigation Test:**
1. Open `http://localhost:5173/emergency`
2. Click "SIMULATE CRASH"
3. **Time it with a stopwatch**
4. Should complete in **2-6 seconds**
5. Hospital list should appear, ranked by ETA
6. Click first hospital to see route on map

### **Success Indicators:**
- ✅ Button shows loading spinner (not disappears)
- ✅ Progress steps visible: "Finding location" → "Searching hospitals" → "Calculating route"
- ✅ Completes in 2-6 seconds
- ✅ Hospital list appears with ETAs
- ✅ Route draws on map
- ✅ No console errors

### **Failure Indicators:**
- ❌ Button disappears (should have Cancel button now)
- ❌ Takes >10 seconds (timeout should trigger)
- ❌ Console shows 502 errors (backend crash)
- ❌ "Location unavailable" with no explanation (check permissions)
- ❌ Blank map (location not working)

---

## 🆘 Still Having Issues?

### **Collect Debug Info:**

1. **Backend logs:**
   Copy the full output from the terminal running `uvicorn`

2. **Browser console:**
   Open DevTools (F12) → Console tab → copy all errors

3. **Network tab:**
   DevTools → Network tab → filter by "XHR" → check failing requests

4. **Version info:**
   ```bash
   python --version
   node --version
   pip list | grep -E "(fastapi|uvicorn|httpx)"
   ```

### **Common Solutions:**

| Symptom | Solution |
|---------|----------|
| Button disappears | Fixed ✅ — refresh page |
| 502 Bad Gateway | Fixed ✅ — restart backend |
| Location not working | Enable browser permissions |
| Slow performance | Wait for cache warmup or self-host OSRM |
| Backend won't start | `pip install -r requirements.txt` |
| Frontend build error | `npm install` and retry |
| CORS errors | Backend must be on 127.0.0.1:8000 |

---

## ✅ Expected Working State

### **Terminal 1 (Backend):**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
[main] providers: groq=llama-3.3-70b-versatile sarvam=configured
INFO:     Application startup complete.
```

### **Terminal 2 (Frontend):**
```
  VITE v5.x.x  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### **Browser Console (Emergency Page):**
```
[No errors]
GET /api/emergency/activate 200 OK (3.2s)
GET /api/emergency/route 200 OK (1.8s)
```

---

If you're still stuck, provide the debug info above and we'll diagnose further!
