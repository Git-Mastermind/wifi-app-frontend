# OpenSignal Wi-Fi Directory Frontend

A React + Vite frontend for your existing Flask API. It uses your current routes and query-string parameters:

- `GET /get-wifis`
- `POST /new-entry?name=...&password=...`
- `POST /upvote?id=...`
- `POST /downvote?id=...`

## 1. Requirements

Install Node.js (LTS) from https://nodejs.org/ if you do not already have it.

## 2. Configure the API URL

In this folder, copy `.env.example` to a new file named `.env`.

Set the value to the public ngrok URL for your **Flask API**, for example:

```env
VITE_API_BASE_URL=https://your-flask-tunnel.ngrok-free.app
```

Do not add a trailing slash. Do not put database credentials in this file.

Whenever the Flask ngrok URL changes, update `.env` and restart the Vite dev server.

## 3. Install and run

Open this folder in VS Code. In the VS Code terminal:

```bash
npm install
npm run dev
```

Vite normally prints a local URL such as `http://localhost:5173`.

## 4. Expose the frontend with ngrok

Keep Flask and its ngrok tunnel running in one terminal. In another terminal, from this frontend folder, run:

```bash
ngrok http 5173
```

Use the new ngrok URL to open the frontend from another device.

You now have two tunnels:
- Flask API tunnel: used by the browser's `fetch()` calls.
- Vite frontend tunnel: serves the website to visitors.

The frontend sends browser requests directly to the Flask API tunnel.

## 5. Enable CORS in Flask

Because the frontend and API are on different origins, the browser requires CORS permission.

Install Flask-CORS in the same Python environment as Flask:

```bash
pip install flask-cors
```

Near the top of your Flask file, after creating `app`, add:

```python
from flask_cors import CORS

app = Flask(__name__)

CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",
            "https://YOUR-FRONTEND-NGROK-DOMAIN.ngrok-free.app"
        ]
    }
})
```

Replace the example frontend ngrok domain with the actual domain printed by `ngrok http 5173`. If your ngrok URL changes, update the allowed origin and restart Flask.

Do not use `origins="*"` for a public app. Restrict CORS to the frontend origins you control. CORS is a browser permission mechanism, not authentication or access control.

## 6. Important compatibility notes about your current API

- The form sends `name` and `password` as query parameters because your current Flask route reads `request.args`.
- The API's `/get-wifis` returns all rows, including passwords. Anyone who can call that public endpoint can retrieve every password. Only put business-authorized guest credentials in this database, and consider changing the API so passwords are not returned in the list response.
- Your current table has no business/location fields, so this frontend only displays the SSID and vote counts. It does not invent location information.
- Your current `/downvote` deletes a row after the threshold. The UI refreshes the list after voting.
- The app currently has no user authentication or vote-rate limiting. Public visitors could repeatedly vote or submit entries. Add server-side protections before a wider public launch.
- Do not commit `.env`, `user_credentials.py`, or database passwords to GitHub.

## 7. Production note

`npm run dev` is a development server, not ideal permanent hosting. For a production deployment, build the static frontend with:

```bash
npm run build
```

The output is in `dist/`. Host that folder on a static hosting provider, and host Flask/MySQL separately. That way your MacBook does not need to stay on for the public website.
