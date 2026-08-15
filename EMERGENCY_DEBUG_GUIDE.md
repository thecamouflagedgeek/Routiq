# Emergency Navigation — Debug Guide

## 🔍 What's Happening Now

The Emergency page has been updated with **extensive debugging** to show you exactly what's going on:

---

## 📊 **New Debug Features Added**

### 1. **Location Source Indicator**
At the top of the Emergency page, you'll now see:
- 🟢 **"Using live GPS: lat, lon"** — Real location working!
- 🔵 **"Using dev location: lat, lon"** — Fallback to `VITE_DEV_LOCATION`
- 🟡 **"No location - GPS permission required"** — Need to enable GPS

### 2. **Console Logging**
Open browser console (F12) to see detailed logs:
```
[Emergency] Starting activation...
[Emergency] geo.position: {lat: 19.123, lon: 72.456}
[Emergency] geo.error: null
[Emergency] DEV_LOCATION: null
[Emergency] Using location: {lat: 19.123, lon: 72.456}
[Emergency] Calling API for hospitals at: {lat: 19.123, lon: 72.456}
[Emergency] API response: {...}
[Emergency] Getting route to: Hospital Name
[Emergency] Navigation started
[Emergency] Activation complete
```

### 3. **Error Display**
If activation fails, you'll see:
- ❌ Red error box with **exact error message**
- 🔄 **Retry button** to try again
- 🎮 **Use Demo Mode** button for fallback

### 4. **No Auto-Fallback**
**Changed behavior:** 
- ❌ OLD: Errors automatically fell back to demo hospital
- ✅ NEW: Errors show what went wrong, let YOU decide

---

## 🐛 **Debugging Your Issues**

### **Issue 1: "Hardcoded Demo Hospital Showing"**

**Possible Causes:**
1. API error → auto-fell-back to demo (now fixed — won't auto-fallback)
2. Backend returned demo data
3. You clicked "Use Demo Mode" button

**How to Check:**
1. Open browser console (F12)
2. Look for `[Emergency] API response:` log
3. Check the response:
   ```javascript
   {
     hospitals_source: "live"  // ✅ Good - real hospitals
     // OR
     hospitals_source: "demo"  // ❌ Demo mode
   }
   ```

**If API returns demo:**
- Backend is falling back to demo mode
- Check backend logs for Overpass errors
- May be no hospitals nearby your location

---

### **Issue 2: "Live Location Not Showing"**

**Diagnostic Steps:**

#### Step 1: Check Browser Console
Look for `[Emergency] geo.position:` log:
- `null` — GPS not available
- `{lat: X, lon: Y}` — GPS working!

#### Step 2: Check Location Indicator
Look at the blue/green/yellow box at top of Emergency page:
- 🟢 Green = Live GPS working
- 🔵 Blue = Using dev override
- 🟡 Yellow = No location available

#### Step 3: Check Browser Permissions
1. Click lock icon (🔒) in address bar
2. Look for "Location" permission
3. Should be "Allow" not "Block"

#### Step 4: Check `geo.error`
Console shows `[Emergency] geo.error:`:
- `"User denied Geolocation"` → Need to enable in browser
- `"Timeout"` → GPS taking too long (common indoors)
- `"Position unavailable"` → Device has no GPS

**Solutions:**

**For Permission Denied:**
```
1. Click lock icon in address bar
2. Site settings → Location → Allow
3. Refresh page (Ctrl+Shift+R)
```

**For Testing Without GPS:**
Create `.env.local` in `frontend/`:
```
VITE_DEV_LOCATION=19.0760,72.8777
```
Then restart frontend: `npm run dev`

---

### **Issue 3: "No Directions/Pathing Shows Up"**

**Possible Causes:**
1. Route API call failed
2. Hospital list empty
3. Map component not receiving route data

**Diagnostic Steps:**

#### Step 1: Check Console Logs
Look for these lines:
```
[Emergency] Getting route to: Hospital Name  ← Should see this
[Emergency] Navigation started               ← Should see this
```

**If missing:**
- Route API call failed
- Check for errors after "Getting route to:"

#### Step 2: Check Network Tab
1. Open DevTools (F12) → Network tab
2. Look for `/api/emergency/route` request
3. Check status:
   - `200 OK` — Success
   - `502 Bad Gateway` — Backend crash
   - `504 Timeout` — OSRM too slow
   - `404 Not Found` — Endpoint issue

#### Step 3: Check Response Data
Click the `/api/emergency/route` request in Network tab:
```json
{
  "geometry": [[lat1,lon1], [lat2,lon2], ...],  // ← Must have this
  "steps": [...],
  "source": "live",  // or "demo"
  "provider": "osrm"  // or "demo"
}
```

**If `geometry` is empty:**
- Backend returned no route
- OSRM couldn't find a path
- Check backend logs

**If request fails:**
- Check backend is running: `http://127.0.0.1:8000/api/health`
- Check for backend errors in terminal

---

## 🔧 **Quick Fixes**

### **Fix 1: Enable Location Access**
```bash
Chrome: Lock icon → Site settings → Location → Allow
Firefox: Lock icon → Permissions → Location → Allow
Edge: Lock icon → Permissions → Location → Allow
```

### **Fix 2: Use Dev Location**
**frontend/.env.local:**
```
VITE_DEV_LOCATION=YOUR_LAT,YOUR_LON
```

**Or edit `frontend/src/config.ts`:**
```typescript
// Temporarily hardcode for testing
export const DEV_LOCATION: { lat: number; lon: number } | null = {
  lat: 19.0760,  // Mumbai
  lon: 72.8777,
};
```

### **Fix 3: Check Backend**
```bash
# Terminal: Backend should show
INFO:     Application startup complete.
[main] providers: ...

# Test directly:
curl http://127.0.0.1:8000/api/health
```

### **Fix 4: Clear Everything**
```bash
# Stop both servers (Ctrl+C)
# Restart backend
cd Routiq/backend
venv\Scripts\activate
uvicorn app.main:app --reload

# Restart frontend
cd Routiq/frontend
npm run dev

# Hard refresh browser: Ctrl+Shift+R
```

---

## 📋 **Expected Console Output (Working)**

```javascript
[Emergency] Starting activation...
[Emergency] geo.position: {lat: 19.0760, lon: 72.8777}
[Emergency] geo.error: null
[Emergency] DEV_LOCATION: null
[Emergency] Using location: {lat: 19.0760, lon: 72.8777}
[Emergency] Calling API for hospitals at: {lat: 19.0760, lon: 72.8777}
[Emergency] API response: {
  emergency_number: "112",
  hospitals: [
    {id: "osm-node-123", name: "Kokilaben Hospital", eta_min: 8, ...},
    {id: "osm-way-456", name: "Nanavati Hospital", eta_min: 12, ...}
  ],
  hospitals_source: "live"
}
[Emergency] Getting route to: Kokilaben Hospital
[Emergency] Navigation started
[Emergency] Activation complete
```

---

## 📋 **Expected Console Output (Errors)**

### **Location Error:**
```javascript
[Emergency] Starting activation...
[Emergency] geo.position: null
[Emergency] geo.error: "User denied Geolocation"
[Emergency] Location error: User denied Geolocation
```

### **API Error:**
```javascript
[Emergency] Starting activation...
[Emergency] Using location: {lat: 19.0760, lon: 72.8777}
[Emergency] Calling API for hospitals at: {lat: 19.0760, lon: 72.8777}
[Emergency] Activation failed: Error: API 502: 
[Emergency] API Error: API 502: 
```

### **No Hospitals:**
```javascript
[Emergency] API response: {hospitals: [], hospitals_source: "live"}
[Emergency] No hospitals returned from API
[Emergency] Activation complete
```

---

## ✅ **Verification Checklist**

Run through this checklist:

- [ ] Location indicator shows **green** (live GPS) or **blue** (dev location)
- [ ] Console shows `geo.position: {lat: X, lon: Y}` (not null)
- [ ] Console shows `API response:` with `hospitals_source: "live"`
- [ ] Console shows `Getting route to:` with hospital name
- [ ] Console shows `Navigation started`
- [ ] Hospital list appears in 2-6 seconds
- [ ] Map shows blue route line to hospital
- [ ] No red error boxes
- [ ] No 502/504 errors in Network tab

---

## 🆘 **Still Not Working?**

### **Collect This Info:**

1. **Location indicator text** (green/blue/yellow message)
2. **Full console output** (copy all `[Emergency]` logs)
3. **Network tab** screenshot showing `/api/emergency/activate` request
4. **Backend logs** (terminal running uvicorn)

### **Most Likely Issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Yellow location indicator | No GPS permission | Enable in browser settings |
| Blue location indicator | Using dev override | Expected for testing without GPS |
| Red error "API 502" | Backend crash | Check backend logs, restart backend |
| Red error "timeout" | OSRM too slow | Wait and retry, or self-host OSRM |
| No hospitals in list | None nearby OR API error | Check console for "No hospitals" message |
| No route on map | Route API failed | Check Network tab for `/api/emergency/route` |
| Demo hospital showing | Error triggered demo fallback | Check console for error before "Demo" appears |

---

## 🎯 **Test Plan**

### **Test 1: With Live GPS**
1. Enable location permissions
2. Refresh page
3. Verify green location indicator
4. Click "SIMULATE CRASH"
5. Should see your actual GPS coordinates used
6. Hospitals should be near your real location

### **Test 2: With Dev Location**
1. Create `frontend/.env.local`:
   ```
   VITE_DEV_LOCATION=19.0760,72.8777
   ```
2. Restart frontend
3. Verify blue location indicator
4. Click "SIMULATE CRASH"
5. Should use Mumbai coordinates
6. Hospitals should be near Mumbai

### **Test 3: Error Handling**
1. Stop backend (Ctrl+C)
2. Click "SIMULATE CRASH"
3. Should see red error box
4. Should have "Retry" and "Use Demo Mode" buttons
5. Click "Use Demo Mode" → demo hospital appears

---

**With all this debugging, you should be able to see exactly where the issue is!**
