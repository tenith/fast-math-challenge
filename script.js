/* =========================================================================
   Fast Math Challenge — script.js
   Vanilla JS single-page app. No frameworks, no backend.
   Architecture (modules via IIFE namespaces):
     - CONFIG        : tunable constants
     - Storage       : safe LocalStorage wrapper
     - QuestionGen   : random question generation
     - Achievements  : achievement definitions + evaluation
     - Stats         : aggregate stats from history
     - UI            : DOM rendering helpers + screen routing
     - Quiz          : quiz lifecycle (start, timer, submit, score)
     - App           : wiring + event listeners
   ========================================================================= */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
     CONFIG
     ---------------------------------------------------------------------- */
  const CONFIG = Object.freeze({
    QUESTION_COUNT: 40,
    SECTION_SIZE: 10,            // questions per guideline section
    TIME_LIMIT_SECONDS: 10 * 60, // 10 minutes
    WARNING_SECONDS: 60,         // last-minute warning animation
    MIN_1_DIGIT: 1,
    MAX_1_DIGIT: 9,
    MIN_2_DIGIT: 10,
    MAX_2_DIGIT: 99,
    MIN_3_DIGIT: 100,
    MAX_3_DIGIT: 999,
    MAX_RESULT: 999,            // answers (and intermediate steps) never exceed this
    MAX_HISTORY: 100,
    STORAGE_KEYS: {
      nickname: "fmc_nickname",
      history: "fmc_history",
      achievements: "fmc_achievements",
    },
  });

  /* ----------------------------------------------------------------------
     Storage — defensive LocalStorage wrapper (handles private mode / quota)
     ---------------------------------------------------------------------- */
  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        console.warn("Storage.get failed:", key, err);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.warn("Storage.set failed:", key, err);
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn("Storage.remove failed:", key, err);
      }
    },
  };

  /* ----------------------------------------------------------------------
     QuestionGen — produces random mental-math questions.

     Question set follows the school guideline, 10 questions per section:
       Section 1 (Q1-10):  2-digit  ± 2-digit
       Section 2 (Q11-20): 3-digit  ± 3-digit
       Section 3 (Q21-30): 3-digit  ± 3-digit  ± 3-digit   (no parentheses,
                           evaluated left-to-right)
       Section 4 (Q31-40): 1-digit  × 1-digit
     Constraints:
       - no negative intermediate or final answers
       - operands stay within their stated digit ranges
     ---------------------------------------------------------------------- */
  const QuestionGen = (function () {
    function randInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function randSign() {
      return Math.random() < 0.5 ? "+" : "-";
    }
    function makeQuestion(text, answer) {
      return { text, answer };
    }

    // Section 1 & 2: a ± b, operands in [min, max].
    // No negatives, and the answer never exceeds CONFIG.MAX_RESULT.
    function twoTerm(min, max) {
      const cap = CONFIG.MAX_RESULT;
      const op = randSign();
      if (op === "+") {
        // Keep a + b <= cap: pick a, then b within the remaining budget.
        const a = randInt(min, Math.min(max, cap - min));
        const b = randInt(min, Math.min(max, cap - a));
        return makeQuestion(`${a} + ${b}`, a + b);
      }
      // Subtraction: swap so a >= b → answer >= 0 (always <= cap).
      let a = randInt(min, max);
      let b = randInt(min, max);
      if (b > a) {
        const t = a; a = b; b = t;
      }
      return makeQuestion(`${a} - ${b}`, a - b);
    }

    // Section 3: a ± b ± c (no parentheses), evaluated left-to-right.
    // Every step stays within [0, CONFIG.MAX_RESULT].
    function threeTerm(min, max) {
      const cap = CONFIG.MAX_RESULT;
      for (let attempts = 0; attempts < 100; attempts++) {
        const a = randInt(min, max);
        const b = randInt(min, max);
        const c = randInt(min, max);
        const op1 = randSign();
        const op2 = randSign();
        const step1 = op1 === "+" ? a + b : a - b;
        if (step1 < 0 || step1 > cap) continue;
        const answer = op2 === "+" ? step1 + c : step1 - c;
        if (answer < 0 || answer > cap) continue;
        return makeQuestion(`${a} ${op1} ${b} ${op2} ${c}`, answer);
      }
      // Guaranteed-valid fallback (should effectively never run).
      return makeQuestion("500 + 300 - 200", 600);
    }

    // Section 4: a × b, single-digit operands.
    function multiply(min, max) {
      const a = randInt(min, max);
      const b = randInt(min, max);
      return makeQuestion(`${a} × ${b}`, a * b);
    }

    // Build the full question set, section by section.
    function build() {
      const n = CONFIG.SECTION_SIZE;
      const list = [];
      for (let i = 0; i < n; i++) list.push(twoTerm(CONFIG.MIN_2_DIGIT, CONFIG.MAX_2_DIGIT));
      for (let i = 0; i < n; i++) list.push(twoTerm(CONFIG.MIN_3_DIGIT, CONFIG.MAX_3_DIGIT));
      for (let i = 0; i < n; i++) list.push(threeTerm(CONFIG.MIN_3_DIGIT, CONFIG.MAX_3_DIGIT));
      for (let i = 0; i < n; i++) list.push(multiply(CONFIG.MIN_1_DIGIT, CONFIG.MAX_1_DIGIT));
      return list;
    }

    return { build };
  })();

  /* ----------------------------------------------------------------------
     Achievements — definitions + evaluation against history.
     Each definition: { id, icon, title, test(ctx) -> bool }
     ctx = { history, latest, streakDays }
     ---------------------------------------------------------------------- */
  const Achievements = (function () {
    const DEFS = [
      {
        id: "first_perfect",
        icon: "👑",
        title: "First Perfect Score",
        test: (ctx) => ctx.history.some((a) => a.score === CONFIG.QUESTION_COUNT),
      },
      {
        id: "completed_5",
        icon: "🖐️",
        title: "5 Challenges Completed",
        test: (ctx) => ctx.history.length >= 5,
      },
      {
        id: "completed_10",
        icon: "🔟",
        title: "10 Challenges Completed",
        test: (ctx) => ctx.history.length >= 10,
      },
      {
        id: "streak_3",
        icon: "🔥",
        title: "3-Day Streak",
        test: (ctx) => ctx.streakDays >= 3,
      },
      {
        id: "accuracy_90_streak",
        icon: "🎯",
        title: "90% Accuracy Streak",
        // Last 3 attempts all >= 90% correctness
        test: (ctx) => {
          if (ctx.history.length < 3) return false;
          const last3 = ctx.history.slice(-3);
          return last3.every((a) => a.correctness >= 90);
        },
      },
      {
        id: "speed_demon",
        icon: "⚡",
        title: "Speed Demon (finish under 5 min)",
        test: (ctx) =>
          ctx.history.some(
            (a) => a.timeUsed <= 300 && a.completion === 100
          ),
      },
    ];

    // Returns array of unlocked achievement ids given the current context.
    function evaluate(ctx) {
      return DEFS.filter((d) => d.test(ctx)).map((d) => d.id);
    }

    function all() {
      return DEFS;
    }

    function byId(id) {
      return DEFS.find((d) => d.id === id);
    }

    return { evaluate, all, byId };
  })();

  /* ----------------------------------------------------------------------
     Stats — aggregate computations over the attempt history.
     ---------------------------------------------------------------------- */
  const Stats = {
    history() {
      const h = Storage.get(CONFIG.STORAGE_KEYS.history, []);
      return Array.isArray(h) ? h : [];
    },

    // Consecutive-day streak ending today (or yesterday-inclusive chain).
    streakDays(history) {
      if (!history.length) return 0;
      // Collect unique day strings (YYYY-MM-DD) that have attempts.
      const days = new Set(history.map((a) => a.date.slice(0, 10)));
      let streak = 0;
      const cursor = new Date();
      // Allow the streak to count from today backwards.
      for (let i = 0; i < 365; i++) {
        const key = cursor.toISOString().slice(0, 10);
        if (days.has(key)) {
          streak++;
        } else if (i === 0) {
          // No attempt today — try starting from yesterday instead.
        } else {
          break;
        }
        cursor.setDate(cursor.getDate() - 1);
      }
      return streak;
    },

    summary(history) {
      if (!history.length) {
        return {
          attempts: 0,
          bestScore: 0,
          avgScore: 0,
          bestAccuracy: 0,
          avgAccuracy: 0,
          fastestTime: null,
          streakDays: 0,
        };
      }
      const scores = history.map((a) => a.score);
      const accuracies = history.map((a) => a.correctness);
      const completedTimes = history
        .filter((a) => a.completion === 100)
        .map((a) => a.timeUsed);

      const sum = (arr) => arr.reduce((s, n) => s + n, 0);

      return {
        attempts: history.length,
        bestScore: Math.max(...scores),
        avgScore: +(sum(scores) / scores.length).toFixed(1),
        bestAccuracy: Math.max(...accuracies),
        avgAccuracy: Math.round(sum(accuracies) / accuracies.length),
        fastestTime: completedTimes.length ? Math.min(...completedTimes) : null,
        streakDays: Stats.streakDays(history),
      };
    },
  };

  /* ----------------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------------- */
  function $(id) {
    return document.getElementById(id);
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ----------------------------------------------------------------------
     UI — screen routing, toasts, and render helpers.
     ---------------------------------------------------------------------- */
  const UI = (function () {
    const screens = ["landing", "challenge", "results", "review", "dashboard"];

    function show(name) {
      screens.forEach((s) => {
        const el = $("screen-" + s);
        if (el) el.classList.toggle("is-active", s === name);
      });
      // Scroll to top on screen change.
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    }

    let toastTimer = null;
    function toast(message) {
      const el = $("toast");
      el.textContent = message;
      el.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
    }

    function statBlock(value, label) {
      return `
        <div class="stat">
          <div class="stat__value">${escapeHtml(value)}</div>
          <div class="stat__label">${escapeHtml(label)}</div>
        </div>`;
    }

    return { show, toast, statBlock };
  })();

  /* ----------------------------------------------------------------------
     Quiz — owns the active quiz state + lifecycle.
     ---------------------------------------------------------------------- */
  const Quiz = (function () {
    let questions = [];     // current question set
    let timerId = null;     // setInterval handle
    let remaining = 0;      // seconds left
    let startedAt = 0;      // epoch ms
    let nickname = "";
    let lastResult = null;  // cached result for review screen

    /* ---- Start ---- */
    function start(name) {
      nickname = name;
      questions = QuestionGen.build();
      remaining = CONFIG.TIME_LIMIT_SECONDS;
      startedAt = Date.now();

      renderQuestions();
      $("player-name").textContent = nickname;
      updateProgress();
      $("timer").classList.remove("is-warning");
      $("timer-value").textContent = formatTime(remaining);

      UI.show("challenge");
      startTimer();

      // Focus the first input for quick entry.
      const first = document.querySelector(".q-card__input");
      if (first) first.focus();
    }

    /* ---- Render question cards ---- */
    function renderQuestions() {
      const form = $("quiz-form");
      const html = questions
        .map(
          (q, i) => `
        <div class="q-card" data-index="${i}">
          <span class="q-card__num">${i + 1}</span>
          <span class="q-card__expr">${escapeHtml(q.text)} =</span>
          <input
            class="q-card__input"
            type="number"
            inputmode="numeric"
            aria-label="Answer for question ${i + 1}: ${escapeHtml(q.text)}"
            data-index="${i}"
          />
        </div>`
        )
        .join("");
      form.innerHTML = html;
    }

    /* ---- Timer ---- */
    function startTimer() {
      stopTimer();
      timerId = setInterval(() => {
        remaining--;
        $("timer-value").textContent = formatTime(remaining);

        if (remaining <= CONFIG.WARNING_SECONDS) {
          $("timer").classList.add("is-warning");
        }
        if (remaining <= 0) {
          stopTimer();
          UI.toast("⏰ Time's up! Submitting...");
          submit(true);
        }
      }, 1000);
    }

    function stopTimer() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    /* ---- Progress ---- */
    function answeredCount() {
      const inputs = document.querySelectorAll(".q-card__input");
      let n = 0;
      inputs.forEach((inp) => {
        if (inp.value.trim() !== "") n++;
      });
      return n;
    }

    function updateProgress() {
      const total = CONFIG.QUESTION_COUNT;
      const done = answeredCount();
      const pct = Math.round((done / total) * 100);

      $("progress-count").textContent = done;
      $("progress-pct").textContent = pct + "%";
      $("progress-fill").style.width = pct + "%";
      $("progress-bar-wrap").setAttribute("aria-valuenow", String(done));
    }

    // Mark a card answered/unanswered (visual cue) + refresh progress.
    function onInput(e) {
      const input = e.target;
      if (!input.classList.contains("q-card__input")) return;
      const card = input.closest(".q-card");
      if (card) {
        card.classList.toggle("is-answered", input.value.trim() !== "");
      }
      updateProgress();
    }

    /* ---- Submit + score ---- */
    function submit(auto) {
      stopTimer();

      const inputs = document.querySelectorAll(".q-card__input");
      const details = [];
      let correct = 0;
      let answered = 0;

      questions.forEach((q, i) => {
        const raw = inputs[i] ? inputs[i].value.trim() : "";
        const hasAnswer = raw !== "";
        const userAnswer = hasAnswer ? parseInt(raw, 10) : null;
        const isCorrect = hasAnswer && userAnswer === q.answer;
        if (hasAnswer) answered++;
        if (isCorrect) correct++;
        details.push({
          index: i,
          text: q.text,
          correctAnswer: q.answer,
          userAnswer,
          hasAnswer,
          isCorrect,
        });
      });

      const timeUsed = Math.min(
        CONFIG.TIME_LIMIT_SECONDS,
        Math.round((Date.now() - startedAt) / 1000)
      );
      const completion = Math.round((answered / CONFIG.QUESTION_COUNT) * 100);
      const correctness = answered > 0 ? Math.round((correct / answered) * 100) : 0;

      const result = {
        nickname,
        date: new Date().toISOString(),
        score: correct,
        total: CONFIG.QUESTION_COUNT,
        answered,
        completion,
        correctness,
        timeUsed,
        autoSubmitted: !!auto,
        details, // kept in-memory only (for review); not persisted
      };

      lastResult = result;
      persistAttempt(result);
      const newlyUnlocked = syncAchievements();

      renderResults(result, newlyUnlocked);
      UI.show("results");
    }

    /* ---- Persist attempt (strip heavy details before saving) ---- */
    function persistAttempt(result) {
      const history = Stats.history();
      const record = {
        nickname: result.nickname,
        date: result.date,
        score: result.score,
        completion: result.completion,
        correctness: result.correctness,
        timeUsed: result.timeUsed,
      };
      history.push(record);
      // Keep only the latest N attempts.
      while (history.length > CONFIG.MAX_HISTORY) history.shift();
      Storage.set(CONFIG.STORAGE_KEYS.history, history);
    }

    /* ---- Achievements: compute, store, return newly-unlocked ids ---- */
    function syncAchievements() {
      const history = Stats.history();
      const ctx = {
        history,
        latest: history[history.length - 1] || null,
        streakDays: Stats.streakDays(history),
      };
      const unlocked = Achievements.evaluate(ctx);
      const prev = Storage.get(CONFIG.STORAGE_KEYS.achievements, []);
      const prevSet = new Set(Array.isArray(prev) ? prev : []);
      const newly = unlocked.filter((id) => !prevSet.has(id));
      Storage.set(CONFIG.STORAGE_KEYS.achievements, unlocked);
      return newly;
    }

    /* ---- Results rendering ---- */
    function ratingFor(percent) {
      if (percent === 100) return { medal: "👑", label: "Math Master" };
      if (percent >= 90) return { medal: "🥇", label: "Gold" };
      if (percent >= 80) return { medal: "🥈", label: "Silver" };
      if (percent >= 70) return { medal: "🥉", label: "Bronze" };
      return { medal: "⭐", label: "Keep Practicing" };
    }

    function renderResults(result, newly) {
      const scorePct = Math.round((result.score / result.total) * 100);
      const rating = ratingFor(scorePct);

      $("result-medal").textContent = rating.medal;
      $("result-rating").textContent = rating.label;
      $("result-score").textContent = `${result.score} / ${result.total}`;
      $("result-name").textContent = result.nickname;

      $("result-stats").innerHTML = [
        UI.statBlock(result.completion + "%", "Completion"),
        UI.statBlock(result.correctness + "%", "Correctness"),
        UI.statBlock(result.score, "Correct Answers"),
        UI.statBlock(result.answered - result.score, "Incorrect Answers"),
        UI.statBlock(formatTime(result.timeUsed), "Time Used"),
        UI.statBlock(
          (result.total - result.answered) + "",
          "Unanswered"
        ),
      ].join("");

      // New achievements section
      const wrap = $("new-achievements");
      if (newly.length) {
        $("new-achievements-list").innerHTML = newly
          .map((id) => {
            const def = Achievements.byId(id);
            return def ? badgeHtml(def, true) : "";
          })
          .join("");
        wrap.hidden = false;
        UI.toast("🎉 New achievement unlocked!");
      } else {
        wrap.hidden = true;
      }
    }

    /* ---- Review rendering ---- */
    function renderReview() {
      if (!lastResult) return;
      const html = lastResult.details
        .map((d) => {
          const cls = d.isCorrect ? "r-card--correct" : "r-card--wrong";
          const mark = d.isCorrect ? "✅" : "❌";
          const yours = d.hasAnswer
            ? escapeHtml(d.userAnswer)
            : "<em>blank</em>";
          const yourCls = d.isCorrect ? "" : "r-ans-yours--wrong";
          return `
          <div class="r-card ${cls}">
            <div class="r-card__top">
              <span class="r-card__num">${d.index + 1}</span>
              <span class="r-card__expr">${escapeHtml(d.text)} =</span>
              <span class="r-card__mark">${mark}</span>
            </div>
            <div class="r-card__answers">
              <span><span class="r-ans-label">Your answer:</span>
                <span class="${yourCls}">${yours}</span></span>
              <span><span class="r-ans-label">Correct:</span>
                <span class="r-ans-correct">${d.correctAnswer}</span></span>
            </div>
          </div>`;
        })
        .join("");
      $("review-list").innerHTML = html;
    }

    function hasActive() {
      return timerId !== null;
    }

    return {
      start,
      submit,
      onInput,
      renderReview,
      stopTimer,
      hasActive,
    };
  })();

  /* ----------------------------------------------------------------------
     Dashboard + landing rendering helpers
     ---------------------------------------------------------------------- */
  function badgeHtml(def, unlocked) {
    return `
      <div class="badge ${unlocked ? "is-unlocked" : ""}">
        <span class="badge__icon">${def.icon}</span>
        <span>${escapeHtml(def.title)}</span>
      </div>`;
  }

  function renderLandingSummary() {
    const history = Stats.history();
    const s = Stats.summary(history);
    const el = $("landing-summary");
    el.innerHTML = [
      UI.statBlock(s.attempts, "Attempts"),
      UI.statBlock(s.attempts ? `${s.bestScore}/40` : "—", "Best Score"),
      UI.statBlock(s.attempts ? `${s.bestAccuracy}%` : "—", "Best Accuracy"),
    ].join("");
  }

  function renderDashboard() {
    const history = Stats.history();
    const s = Stats.summary(history);

    $("dashboard-stats").innerHTML = [
      UI.statBlock(s.attempts ? `${s.bestScore}/40` : "—", "Best Score"),
      UI.statBlock(s.attempts ? `${s.avgScore}/40` : "—", "Average Score"),
      UI.statBlock(s.attempts, "Total Attempts"),
      UI.statBlock(s.attempts ? `${s.bestAccuracy}%` : "—", "Best Accuracy"),
      UI.statBlock(s.attempts ? `${s.avgAccuracy}%` : "—", "Avg Accuracy"),
      UI.statBlock(
        s.fastestTime != null ? formatTime(s.fastestTime) : "—",
        "Fastest Completion"
      ),
      UI.statBlock(`${s.streakDays} 🔥`, "Day Streak"),
    ].join("");

    // Achievements (all defs, with unlocked state)
    const unlocked = new Set(
      Storage.get(CONFIG.STORAGE_KEYS.achievements, [])
    );
    $("dashboard-achievements").innerHTML = Achievements.all()
      .map((def) => badgeHtml(def, unlocked.has(def.id)))
      .join("");

    // Recent attempts table (newest first)
    const tbody = $("attempts-tbody");
    if (!history.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No attempts yet — play your first challenge!</td></tr>`;
    } else {
      const rows = history
        .slice()
        .reverse()
        .slice(0, 25)
        .map(
          (a) => `
          <tr>
            <td>${escapeHtml(formatDate(a.date))}</td>
            <td><strong>${a.score}/40</strong></td>
            <td>${a.completion}%</td>
            <td>${a.correctness}%</td>
            <td>${formatTime(a.timeUsed)}</td>
          </tr>`
        )
        .join("");
      tbody.innerHTML = rows;
    }
  }

  /* ----------------------------------------------------------------------
     App — wiring & event listeners
     ---------------------------------------------------------------------- */
  const App = (function () {
    function getNickname() {
      return ($("nickname-input").value || "").trim();
    }

    function handleStart() {
      const name = getNickname();
      const errEl = $("nickname-error");
      if (!name) {
        errEl.hidden = false;
        $("nickname-input").focus();
        return;
      }
      errEl.hidden = true;
      Storage.set(CONFIG.STORAGE_KEYS.nickname, name);
      Quiz.start(name);
    }

    function confirmFinish() {
      // Confirm only if there are unanswered questions and time remains.
      if (Quiz.hasActive()) {
        const ok = window.confirm(
          "Finish the challenge now and see your results?"
        );
        if (!ok) return;
      }
      Quiz.submit(false);
    }

    function goHome() {
      renderLandingSummary();
      UI.show("landing");
    }

    function init() {
      // Load saved nickname
      const saved = Storage.get(CONFIG.STORAGE_KEYS.nickname, "");
      if (saved) $("nickname-input").value = saved;

      renderLandingSummary();

      /* ---- Landing ---- */
      $("start-btn").addEventListener("click", handleStart);
      $("nickname-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleStart();
      });
      $("nickname-input").addEventListener("input", () => {
        $("nickname-error").hidden = true;
      });
      $("view-dashboard-btn").addEventListener("click", () => {
        renderDashboard();
        UI.show("dashboard");
      });

      /* ---- Challenge ---- */
      // Delegated input handler for all answer fields.
      $("quiz-form").addEventListener("input", Quiz.onInput);
      // Pressing Enter inside an answer field moves to the next field.
      $("quiz-form").addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const inputs = Array.from(
          document.querySelectorAll(".q-card__input")
        );
        const idx = inputs.indexOf(e.target);
        if (idx > -1 && idx < inputs.length - 1) inputs[idx + 1].focus();
      });
      $("finish-btn").addEventListener("click", confirmFinish);
      $("finish-btn-bottom").addEventListener("click", confirmFinish);

      /* ---- Results ---- */
      $("review-btn").addEventListener("click", () => {
        Quiz.renderReview();
        UI.show("review");
      });
      $("retry-btn").addEventListener("click", () => {
        const name =
          getNickname() ||
          Storage.get(CONFIG.STORAGE_KEYS.nickname, "Player");
        Quiz.start(name);
      });
      $("results-dashboard-btn").addEventListener("click", () => {
        renderDashboard();
        UI.show("dashboard");
      });
      $("results-home-btn").addEventListener("click", goHome);

      /* ---- Review ---- */
      $("review-back-btn").addEventListener("click", () => UI.show("results"));
      $("review-home-btn").addEventListener("click", goHome);

      /* ---- Dashboard ---- */
      $("dashboard-home-btn").addEventListener("click", goHome);
      $("clear-history-btn").addEventListener("click", () => {
        const ok = window.confirm(
          "Clear all saved attempts and achievements? This cannot be undone."
        );
        if (!ok) return;
        Storage.remove(CONFIG.STORAGE_KEYS.history);
        Storage.remove(CONFIG.STORAGE_KEYS.achievements);
        renderDashboard();
        renderLandingSummary();
        UI.toast("History cleared.");
      });

      /* ---- Warn before leaving an active quiz ---- */
      window.addEventListener("beforeunload", (e) => {
        if (Quiz.hasActive()) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
    }

    return { init };
  })();

  // Expose badgeHtml to the Quiz module's closure scope via hoisting:
  // (badgeHtml is a function declaration, so it is available everywhere above.)

  /* ---- Boot ---- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", App.init);
  } else {
    App.init();
  }
})();
