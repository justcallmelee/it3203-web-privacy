/* ==========================================================
   IT 3203 Project - Milestone #2
   quiz.js: logic for the Web 3.0 & Digital Privacy quiz
   - Starts a 15-minute countdown when the user clicks Start
   - Tracks how many questions have been answered
   - Grades the answers on submit (or when time runs out)
   - Shows pass/fail, total score, per-question results and time spent
   - Resets everything when the user clicks Retake Quiz
   ========================================================== */

"use strict";

/* ---------- Quiz settings ---------- */
const TIME_LIMIT_SECONDS = 15 * 60; // 15-minute limit
const POINTS_PER_QUESTION = 10;
const PASSING_SCORE = 70;           // out of 100

/* ---------- Answer key ----------
   type "text"     -> fill in the blank; any value in "accept" is correct
   type "radio"    -> one correct value
   type "select"   -> one correct value from a drop-down list
   type "checkbox" -> every value in "correct" must be checked, and nothing else
   "answerText" is the correct answer shown to the user in the results. */
const ANSWER_KEY = [
  {
    id: "q1", type: "text", topic: "Shared, append-only ledger",
    accept: ["blockchain", "a blockchain", "block chain", "blockchains"],
    answerText: "Blockchain"
  },
  {
    id: "q2", type: "text", topic: "IPFS file identifier",
    accept: ["cid", "cids", "a cid"],
    answerText: "CID"
  },
  {
    id: "q3", type: "text", topic: "Ethereum consensus change",
    accept: ["stake", "proof of stake"],
    answerText: "Stake"
  },
  {
    id: "q4", type: "radio", topic: "Wallet address privacy",
    correct: "pseudonymous",
    answerText: "Pseudonymous: not your name, but it can be traced"
  },
  {
    id: "q5", type: "radio", topic: "Zero-knowledge proofs",
    correct: "b",
    answerText: "Prove a statement is true without revealing the data behind it"
  },
  {
    id: "q6", type: "radio", topic: "The DAO incident",
    correct: "reentrancy",
    answerText: "Reentrancy"
  },
  {
    id: "q7", type: "select", topic: "Fixing deployed contracts",
    correct: "b",
    answerText: "The code is usually immutable once it is on the blockchain"
  },
  {
    id: "q8", type: "checkbox", topic: "Public blockchain privacy risks",
    correct: ["visible", "permanent", "kyc"],
    answerText: "Transactions can be viewed by anyone; Data cannot be deleted; An address can be linked to a real identity"
  },
  {
    id: "q9", type: "checkbox", topic: "Privacy-friendly practices",
    correct: ["offchain", "hashes", "encrypt"],
    answerText: "Keep personal data off-chain; Store only hashes or proofs on-chain; Encrypt files before uploading to IPFS"
  },
  {
    id: "q10", type: "radio", topic: "Lost private key",
    correct: "c",
    answerText: "You lose access to the account and its assets"
  }
];

/* ---------- Page elements (found once, reused below) ---------- */
const form = document.getElementById("quiz-form");
const questionsFieldset = document.getElementById("quiz-questions");
const introSection = document.getElementById("quiz-intro");
const startButton = document.getElementById("start-btn");
const resetButton = document.getElementById("reset-btn");
const resultsSection = document.getElementById("results");
const timerDisplay = document.getElementById("timer");
const answeredCount = document.getElementById("answered-count");
const progressBar = document.getElementById("progress-bar");

/* ---------- Quiz state ---------- */
let timerId = null;      // id returned by setInterval
let startTime = 0;       // when the quiz started (milliseconds)
let secondsLeft = TIME_LIMIT_SECONDS;
let submitted = false;

/* ==========================================================
   Helper functions
   ========================================================== */

/* Turns a number of seconds into "m:ss" text, e.g. 75 -> "1:15" */
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

/* Cleans a typed answer so " Blockchain. " matches "blockchain" */
function normalize(text) {
  return text.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
}

/* Reads the user's answer for one question.
   Returns a string for text/radio/select, or an array for checkboxes. */
function getUserAnswer(question) {
  if (question.type === "text") {
    return form.querySelector(`input[name="${question.id}"]`).value;
  }
  if (question.type === "select") {
    return form.querySelector(`select[name="${question.id}"]`).value;
  }
  if (question.type === "radio") {
    const checked = form.querySelector(`input[name="${question.id}"]:checked`);
    return checked ? checked.value : "";
  }
  // checkbox: collect every checked value
  const boxes = form.querySelectorAll(`input[name="${question.id}"]:checked`);
  return Array.from(boxes, (box) => box.value);
}

/* Returns the visible label text for the user's choice, for the results table */
function describeAnswer(question, answer) {
  if (answer === "" || (Array.isArray(answer) && answer.length === 0)) {
    return "(no answer)";
  }
  if (question.type === "text") {
    return answer.trim();
  }
  if (question.type === "select") {
    const select = form.querySelector(`select[name="${question.id}"]`);
    return select.options[select.selectedIndex].text;
  }
  // radio or checkbox: read the text of each chosen option's label
  const values = Array.isArray(answer) ? answer : [answer];
  return values
    .map((value) => {
      const input = form.querySelector(`input[name="${question.id}"][value="${value}"]`);
      return input.parentElement.textContent.trim();
    })
    .join("; ");
}

/* Checks whether one answer is correct */
function isCorrect(question, answer) {
  switch (question.type) {
    case "text":
      return question.accept.includes(normalize(answer));
    case "radio":
    case "select":
      return answer === question.correct;
    case "checkbox":
      // same number of choices, and every chosen value is a correct one
      return answer.length === question.correct.length &&
             answer.every((value) => question.correct.includes(value));
    default:
      return false;
  }
}

/* Counts answered questions and updates the sidebar progress */
function updateProgress() {
  let count = 0;
  ANSWER_KEY.forEach((question) => {
    const answer = getUserAnswer(question);
    const hasAnswer = Array.isArray(answer) ? answer.length > 0 : answer.trim() !== "";
    if (hasAnswer) {
      count++;
    }
  });
  answeredCount.textContent = count;
  progressBar.value = count;
  progressBar.textContent = count + " of 10";
}

/* ==========================================================
   Timer
   ========================================================== */

/* Updates the countdown text and its warning color */
function renderTimer() {
  timerDisplay.textContent = formatTime(secondsLeft);
  timerDisplay.classList.toggle("timer-warning", secondsLeft <= 120 && secondsLeft > 60);
  timerDisplay.classList.toggle("timer-danger", secondsLeft <= 60);
}

/* Runs once per second while the quiz is active */
function tick() {
  secondsLeft--;
  renderTimer();
  if (secondsLeft <= 0) {
    gradeQuiz(true); // time is up: submit automatically
  }
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

/* ==========================================================
   Main actions: start, grade, reset
   ========================================================== */

/* Start button: unlock the questions and start the clock */
function startQuiz() {
  submitted = false;
  secondsLeft = TIME_LIMIT_SECONDS;
  startTime = Date.now();
  renderTimer();
  questionsFieldset.disabled = false;
  form.classList.remove("not-started");
  introSection.hidden = true;
  timerId = setInterval(tick, 1000);
  document.getElementById("q1-input").focus();
}

/* Grades every question and shows the results.
   timedOut is true when the timer ran out. */
function gradeQuiz(timedOut) {
  if (submitted) {
    return; // prevents grading twice
  }
  submitted = true;
  stopTimer();

  // Time spent, capped at the 15-minute limit
  const secondsSpent = Math.min(
    Math.round((Date.now() - startTime) / 1000),
    TIME_LIMIT_SECONDS
  );

  let totalScore = 0;
  let correctCount = 0;
  const rows = [];

  ANSWER_KEY.forEach((question, index) => {
    const answer = getUserAnswer(question);
    const correct = isCorrect(question, answer);
    const points = correct ? POINTS_PER_QUESTION : 0;
    totalScore += points;
    if (correct) {
      correctCount++;
    }

    // Color the question on the page and add a short feedback line
    const block = document.getElementById(question.id);
    block.classList.add(correct ? "is-correct" : "is-incorrect");
    const feedback = document.createElement("p");
    feedback.className = "feedback";
    feedback.textContent = correct
      ? "Correct! +" + POINTS_PER_QUESTION + " points"
      : "Incorrect. Correct answer: " + question.answerText;
    block.appendChild(feedback);

    rows.push({
      number: index + 1,
      topic: question.topic,
      yourAnswer: describeAnswer(question, answer),
      correctAnswer: question.answerText,
      correct: correct,
      points: points
    });
  });

  // Lock the answers so they cannot be changed after grading
  questionsFieldset.disabled = true;
  showResults(totalScore, correctCount, secondsSpent, rows, timedOut);
  resetButton.hidden = false;
}

/* Builds the results panel at the top of the page */
function showResults(totalScore, correctCount, secondsSpent, rows, timedOut) {
  const passed = totalScore >= PASSING_SCORE;

  // Summary: pass/fail banner and score cards
  let html = `
    <div class="result-banner ${passed ? "pass" : "fail"}">
      <h2>${passed ? "You Passed!" : "Not Passed"}</h2>
      <p>${passed
        ? "Great work. You understand the key ideas of Web 3.0 and privacy."
        : "You need " + PASSING_SCORE + " points to pass. Review the topic pages and try again."}</p>
    </div>
    ${timedOut ? '<p class="time-up">Time ran out, so your quiz was submitted automatically.</p>' : ""}
    <div class="score-grid">
      <div class="score-card">
        <span class="score-label">Total Score</span>
        <span class="score-value ${passed ? "good" : "bad"}">${totalScore} / 100</span>
      </div>
      <div class="score-card">
        <span class="score-label">Correct Answers</span>
        <span class="score-value">${correctCount} of ${ANSWER_KEY.length}</span>
      </div>
      <div class="score-card">
        <span class="score-label">Time Spent</span>
        <span class="score-value">${formatTime(secondsSpent)}</span>
      </div>
    </div>
    <h3>Question-by-Question Results</h3>
    <div class="table-scroll">
      <table class="results-table">
        <caption>Your answers compared with the correct answers</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Topic</th>
            <th scope="col">Your Answer</th>
            <th scope="col">Correct Answer</th>
            <th scope="col">Result</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>`;

  // One table row per question
  rows.forEach((row) => {
    html += `
          <tr>
            <td>${row.number}</td>
            <td>${row.topic}</td>
            <td>${escapeHtml(row.yourAnswer)}</td>
            <td>${row.correctAnswer}</td>
            <td><span class="badge ${row.correct ? "badge-correct" : "badge-incorrect"}">${row.correct ? "Correct" : "Incorrect"}</span></td>
            <td>${row.points} / ${POINTS_PER_QUESTION}</td>
          </tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>`;

  resultsSection.innerHTML = html;
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Prevents typed answers from being read as HTML in the results table */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* Retake button: clear every answer, result, color and timer */
function resetQuiz() {
  stopTimer();
  form.reset(); // clears text boxes, radio buttons, checkboxes and the select list

  // Remove result colors and feedback from each question
  ANSWER_KEY.forEach((question) => {
    const block = document.getElementById(question.id);
    block.classList.remove("is-correct", "is-incorrect");
    const feedback = block.querySelector(".feedback");
    if (feedback) {
      feedback.remove();
    }
  });

  resultsSection.innerHTML = "";
  resultsSection.hidden = true;
  resetButton.hidden = true;
  updateProgress();

  // Restart right away with a fresh 15 minutes
  startQuiz();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==========================================================
   Event listeners
   ========================================================== */
startButton.addEventListener("click", startQuiz);

form.addEventListener("submit", (event) => {
  event.preventDefault(); // stay on this page instead of reloading
  gradeQuiz(false);
});

resetButton.addEventListener("click", resetQuiz);

// "input" fires for typing, and "change" for radio buttons, checkboxes and the select list
form.addEventListener("input", updateProgress);
form.addEventListener("change", updateProgress);

renderTimer();
