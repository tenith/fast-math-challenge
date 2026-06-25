# ⚡ Fast Math Challenge

A friendly, colorful mental-math game for **Primary 2** students. Solve **40 questions in 10 minutes** — covering addition, subtraction, and multiplication — earn medals, build streaks, and track your progress over time — all in the browser, with **no backend and no database**.

Built with **pure HTML, CSS, and vanilla JavaScript**. Data is saved locally in your browser via **LocalStorage**, so every player's history stays on their own device.

---

## ✨ Features

- **40 randomized questions** per attempt, organized into four sections of 10:
  | Questions | Format | Example |
  |-----------|--------|---------|
  | 1–10 | 2-digit ± 2-digit | `86 - 13 = ____` |
  | 11–20 | 3-digit ± 3-digit | `968 - 302 = ____` |
  | 21–30 | 3-digit ± 3-digit ± 3-digit (no parentheses, left-to-right) | `721 - 642 + 765 = ____` |
  | 31–40 | 1-digit × 1-digit | `9 × 6 = ____` |
  - Guaranteed **no negative intermediate or final answers**
- **10-minute countdown timer** — large, always visible, sticky on mobile, with a warning animation in the final 60 seconds
- **Auto-submit** when time runs out, or finish early with one tap
- **Live progress tracking** — `Completed X / 40`, progress bar, and percentage
- **Results screen** with score, completion %, correctness %, time used, and a **performance medal**:
  | Score | Medal |
  |-------|-------|
  | 100% | 👑 Math Master |
  | 90–99% | 🥇 Gold |
  | 80–89% | 🥈 Silver |
  | 70–79% | 🥉 Bronze |
  | Below 70% | ⭐ Keep Practicing |
- **Review mode** — every question color-coded green (correct) or red (incorrect), showing your answer and the correct answer
- **Dashboard** — best score, average score, total attempts, best/average accuracy, fastest completion, and a recent-attempts table
- **Gamification** — achievement badges, day streak counter, and best personal record (latest 100 attempts kept)
- **Responsive, mobile-first design** inspired by Duolingo and Khan Academy Kids — works on desktop, iPad, Android tablets, iPhone, and small phones
- **Accessible**: semantic HTML, ARIA labels, keyboard navigation (Enter moves to the next answer), and `prefers-reduced-motion` support

---

## 📁 Project Structure

```
/index.html    → App shell & all screens (markup)
/style.css     → Responsive, themed styles
/script.js     → Game logic (vanilla JS, modular)
/README.md     → This file
```

No build step, no dependencies, no installation required.

---

## 🛠️ Local Development

Because the app is plain static files, you can simply **open `index.html` in a browser**. For the most reliable behavior (and to mirror production), serve it over a local HTTP server:

**Using Python 3**
```bash
cd FMath
python -m http.server 8000
# Visit http://localhost:8000
```

**Using Node.js**
```bash
cd FMath
npx serve .
# or: npx http-server .
```

**Using VS Code**
Install the **Live Server** extension, right-click `index.html`, and choose **"Open with Live Server."**

---

## 🚀 Deployment

The app is 100% static, so it deploys anywhere that serves files. Three popular free options:

### GitHub Pages

1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder, then **Save**.
5. Your site goes live at `https://<username>.github.io/<repo>/` within a minute or two.

> Tip: keep `index.html`, `style.css`, and `script.js` in the repository root so paths resolve correctly.

### Netlify

**Option A — Drag & drop**
1. Sign in at [app.netlify.com](https://app.netlify.com).
2. Drag the project folder onto the **"Add new site → Deploy manually"** drop zone.
3. Netlify gives you a live URL instantly.

**Option B — Git integration**
1. Click **Add new site → Import an existing project** and connect your Git provider.
2. Choose the repository.
3. Leave the **build command empty** and set the **publish directory** to the project root (`.`).
4. Click **Deploy**.

### Cloudflare Pages

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com) and open **Workers & Pages**.
2. Click **Create application → Pages → Connect to Git** and select your repository.
3. In build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**. Your site publishes to `https://<project>.pages.dev`.

---

## 🎮 How to Play

1. Enter a **nickname** (saved automatically for next time).
2. Press **Start Challenge**.
3. Answer as many of the **40 questions** as you can before the **10-minute** timer ends.
4. Tap **Finish Challenge** or let the timer auto-submit.
5. See your **score, medal, and statistics**, then **Review Answers** or check the **Dashboard**.

---

## 🔐 Privacy

There is no server and no tracking. All data (nickname, attempt history, achievements) is stored only in your browser's **LocalStorage** and never leaves your device. Use **Clear History** on the dashboard to remove it at any time.

---

## 🧩 Technical Notes

- **Question generation** builds four fixed sections (2-digit ±, 3-digit ±, 3-digit ± ± three-term left-to-right, and 1-digit × 1-digit), retrying where needed so every constraint is satisfied (operands stay within their digit range, no negative intermediate or final values).
- **State management** is split into small modules inside one IIFE: `Storage`, `QuestionGen`, `Achievements`, `Stats`, `UI`, `Quiz`, and `App`.
- **Error handling**: the LocalStorage wrapper degrades gracefully in private-browsing mode or when storage is full.
- **Browser support**: any modern browser (Chrome, Edge, Firefox, Safari) on desktop or mobile.

---

## 📜 License

Free to use and modify for educational purposes. 🎓
