/* CS in Study Hall: shared behavior for every module.
   A module page calls Course.init({...}) with its id, required tasks and completion code,
   then uses Course.mc, Course.python.editors, Course.python.parsons, etc. for its tasks.
   Read Course.state.extra only after Course.init, which loads the student's saved progress into it. */
window.Course = (function () {
  "use strict";

  var M = null;
  var KEY = "";
  var state = { done: {}, code: {}, parsons: [], hints: {}, reflect: "", extra: {} };

  /* ---------- helpers ---------- */
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function feedback(box, ok, msg, raw, list) {
    box.innerHTML = "";
    if (!msg) return;
    var fb = el("div", { "class": "feedback " + (ok ? "ok" : "bad"), role: "status" });
    fb.appendChild(el("span", null, (ok ? "✓ " : "") + msg));
    if (list && list.length) {
      var ul = el("ul");
      list.forEach(function (t) { ul.appendChild(el("li", null, t)); });
      fb.appendChild(ul);
    }
    if (raw) fb.appendChild(el("span", { "class": "raw" }, "Python says: " + raw));
    box.appendChild(fb);
  }

  function markDone(id) {
    if (!state.done[id]) { state.done[id] = true; save(); }
    refresh();
  }

  /* ---------- hint ladders ---------- */
  function renderHints(id, hints, box) {
    box.innerHTML = "";
    var shown = Math.min(state.hints[id] || 0, hints.length);
    for (var i = 0; i < shown; i++) box.appendChild(el("div", { "class": "hint" }, "Hint " + (i + 1) + ": " + hints[i]));
  }
  function hints(id, list, button, box) {
    renderHints(id, list, box);
    button.addEventListener("click", function () {
      var shown = state.hints[id] || 0;
      if (shown < list.length) { state.hints[id] = shown + 1; save(); }
      renderHints(id, list, box);
      if ((state.hints[id] || 0) >= list.length) button.textContent = "No more hints";
    });
  }

  /* ---------- multiple choice ---------- */
  // Code answers (multi-line, or marked code: true) show in the code font; everything else in the body font.
  function choiceBody(c) {
    return (c.code || c.text.indexOf("\n") !== -1) ? el("pre", null, c.text) : el("span", { "class": "choice-text" }, c.text);
  }
  // opts: { task, container, feedback, choices: [{ text, right, why }] }
  function mc(opts) {
    var wrap = $(opts.container);
    var fb = $(opts.feedback);
    opts.choices.forEach(function (c, i) {
      var b = el("button", { "class": "choice", type: "button" });
      b.appendChild(el("span", { "class": "letter" }, "ABCDEF"[i]));
      b.appendChild(choiceBody(c));
      b.addEventListener("click", function () {
        wrap.querySelectorAll(".choice").forEach(function (x) { x.classList.remove("right", "wrong"); });
        b.classList.add(c.right ? "right" : "wrong");
        feedback(fb, !!c.right, c.why);
        if (c.right) markDone(opts.task);
      });
      if (state.done[opts.task] && c.right) b.classList.add("right");
      wrap.appendChild(b);
    });
  }

  /* ---------- several multiple-choice questions in one task ---------- */
  // opts: { task, container, questions: [{ q, code, choices: [{ text, right, why }] }], okMsg }
  function quiz(opts) {
    var wrap = $(opts.container);
    var got = state.extra[opts.task] || (state.extra[opts.task] = {});
    var summary = el("div");
    opts.questions.forEach(function (question, qi) {
      var block = el("div", { "class": "quiz-q" });
      block.appendChild(el("p", { "class": "q" }, (qi + 1) + ". " + question.q));
      if (question.code) {
        var ex = el("div", { "class": "example" });
        var sw = el("div", { "class": "src-wrap" });
        sw.appendChild(el("pre", { "class": "src" }, question.code));
        ex.appendChild(sw);
        block.appendChild(ex);
      }
      var choices = el("div", { "class": "choices" });
      var fb = el("div");
      question.choices.forEach(function (c, i) {
        var b = el("button", { "class": "choice", type: "button" });
        b.appendChild(el("span", { "class": "letter" }, "ABCDEF"[i]));
        b.appendChild(choiceBody(c));
        b.addEventListener("click", function () {
          choices.querySelectorAll(".choice").forEach(function (x) { x.classList.remove("right", "wrong"); });
          b.classList.add(c.right ? "right" : "wrong");
          feedback(fb, !!c.right, c.why);
          if (c.right) got[qi] = true;
          save();
          if (opts.questions.every(function (_, k) { return got[k]; })) {
            feedback(summary, true, opts.okMsg || "All questions right.");
            markDone(opts.task);
          }
        });
        if (got[qi] && c.right) b.classList.add("right");
        choices.appendChild(b);
      });
      block.appendChild(choices);
      block.appendChild(fb);
      wrap.appendChild(block);
    });
    wrap.appendChild(summary);
  }

  /* ---------- typed answers ---------- */
  // opts: { task, items: [{ id, answer }], button, feedback, okMsg, wrongMsg(wrongIds), hints: { list, button, box } }
  // answer can be a number, a string (case and extra spaces ignored), an array of accepted strings, or a function(value) -> bool.
  function matches(value, answer) {
    var v = String(value).trim();
    if (typeof answer === "function") return !!answer(v);
    if (typeof answer === "number") return v !== "" && Number(v.replace(/,/g, "")) === answer;
    var norm = function (s) { return String(s).trim().toUpperCase().replace(/\s+/g, " "); };
    var list = Array.isArray(answer) ? answer : [answer];
    return list.some(function (a) { return norm(a) === norm(v); });
  }
  function answers(opts) {
    var saved = state.extra[opts.task] || (state.extra[opts.task] = {});
    opts.items.forEach(function (it) {
      var input = $(it.id);
      input.value = saved[it.id] || "";
      input.addEventListener("input", function () { saved[it.id] = input.value; save(); });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $(opts.button).click(); } });
    });
    $(opts.button).addEventListener("click", function () {
      var wrong = opts.items.filter(function (it) {
        var ok = matches($(it.id).value, it.answer);
        var mark = $(it.id + "-m");
        if (mark) {
          var blank = $(it.id).value.trim() === "";
          mark.textContent = ok ? "✓" : (blank ? "" : "✗");
          mark.className = "mark " + (ok ? "ok" : "bad");
        }
        return !ok;
      }).map(function (it) { return it.id; });
      if (!wrong.length) {
        feedback($(opts.feedback), true, opts.okMsg || "All correct.");
        markDone(opts.task);
      } else {
        var msg = opts.wrongMsg ? opts.wrongMsg(wrong) : (opts.items.length > 1 ? "Not yet. Fix the ones marked ✗." : "Not yet. Try again.");
        feedback($(opts.feedback), false, msg);
      }
    });
    if (opts.hints) hints(opts.task, opts.hints.list, $(opts.hints.button), $(opts.hints.box));
  }

  /* ---------- tap to put steps in order ---------- */
  // opts: { task, bank, seq, button, feedback, items: [text], correct: [indices in order], okMsg, hints: { list, button, box } }
  function order(opts) {
    var seq = state.extra[opts.task] || (state.extra[opts.task] = []);
    var bank = $(opts.bank), list = $(opts.seq);
    function render() {
      bank.innerHTML = ""; list.innerHTML = "";
      opts.items.forEach(function (txt, i) {
        if (seq.indexOf(i) !== -1) return;
        var b = el("button", { "class": "pline plain", type: "button", "aria-label": "Add step: " + txt }, txt);
        b.addEventListener("click", function () { seq.push(i); save(); render(); });
        bank.appendChild(b);
      });
      seq.forEach(function (i, pos) {
        var b = el("button", { "class": "pline plain", type: "button", "aria-label": "Remove step " + (pos + 1) + ": " + opts.items[i] }, (pos + 1) + ". " + opts.items[i]);
        b.addEventListener("click", function () { seq.splice(pos, 1); save(); render(); });
        list.appendChild(b);
      });
      if (!seq.length) list.appendChild(el("div", { "class": "empty" }, "Tap items on the left to add them here, in order."));
      if (!bank.children.length) bank.appendChild(el("div", { "class": "empty" }, "All items used."));
    }
    render();
    $(opts.button).addEventListener("click", function () {
      var fb = $(opts.feedback);
      var right = opts.correct;
      var same = seq.length === right.length && seq.every(function (v, k) { return v === right[k]; });
      if (same) { feedback(fb, true, opts.okMsg || "Correct order."); markDone(opts.task); return; }
      var extra = seq.filter(function (i) { return right.indexOf(i) === -1; });
      if (extra.length) { feedback(fb, false, "One or more of your items doesn't belong. Not every item is needed."); return; }
      if (seq.length < right.length) { feedback(fb, false, "You need " + right.length + " items. You have " + seq.length + "."); return; }
      var k = 0;
      while (k < seq.length && seq[k] === right[k]) k++;
      feedback(fb, false, k === 0 ? "The first item isn't right yet. What has to happen first?" : "The first " + k + " are in the right order. Look again at item " + (k + 1) + ".");
    });
    if (opts.hints) hints(opts.task, opts.hints.list, $(opts.hints.button), $(opts.hints.box));
  }

  /* ---------- sort items into categories ---------- */
  // opts: { task, container, categories: [names], items: [{ text, cat }], button, feedback, okMsg, hints: { list, button, box } }
  function sort(opts) {
    var picks = state.extra[opts.task] || (state.extra[opts.task] = {});
    var wrap = $(opts.container);
    var rows = opts.items.map(function (it, i) {
      var row = el("div", { "class": "sort-row" });
      row.appendChild(el("span", { "class": "sort-text" }, it.text));
      var seg = el("div", { "class": "seg", role: "group", "aria-label": it.text });
      opts.categories.forEach(function (c, ci) {
        var b = el("button", { type: "button", "aria-pressed": picks[i] === ci ? "true" : "false" }, c);
        b.addEventListener("click", function () {
          picks[i] = ci; save();
          seg.querySelectorAll("button").forEach(function (x, xi) { x.setAttribute("aria-pressed", xi === ci ? "true" : "false"); });
          row.classList.remove("right", "wrong");
        });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      wrap.appendChild(row);
      return row;
    });
    $(opts.button).addEventListener("click", function () {
      var wrong = 0, blank = 0;
      opts.items.forEach(function (it, i) {
        var ok = picks[i] === it.cat;
        if (picks[i] == null) blank++;
        else if (!ok) wrong++;
        rows[i].classList.toggle("right", ok);
        rows[i].classList.toggle("wrong", picks[i] != null && !ok);
      });
      var fb = $(opts.feedback);
      if (!wrong && !blank) { feedback(fb, true, opts.okMsg || "All sorted correctly."); markDone(opts.task); }
      else if (blank) feedback(fb, false, "Choose a category for every item. " + blank + " still need one.");
      else feedback(fb, false, (opts.items.length - wrong) + " of " + opts.items.length + " are right. Look again at the ones marked in red.");
    });
    if (opts.hints) hints(opts.task, opts.hints.list, $(opts.hints.button), $(opts.hints.box));
  }

  // Read another module's saved progress on this device (used by the capstone).
  function loadModule(id) {
    try { return JSON.parse(localStorage.getItem("cs-study-hall:" + id) || "null"); } catch (e) { return null; }
  }

  /* ---------- copy to clipboard ---------- */
  function copyText(text, msgEl, fallbackEl) {
    function fallback() {
      msgEl.textContent = "Copy didn't work here. Select the text and copy it yourself.";
      if (fallbackEl) { fallbackEl.focus(); if (fallbackEl.select) fallbackEl.select(); }
    }
    try {
      navigator.clipboard.writeText(text).then(function () { msgEl.textContent = "Copied. Paste it into Blackbaud."; }, fallback);
    } catch (e) { fallback(); }
  }

  /* ---------- progress display ---------- */
  function refresh() {
    if (!M) return;
    var req = M.required;
    var count = req.filter(function (id) { return state.done[id]; }).length;
    var all = count === req.length;
    $("meter").textContent = count + " of " + req.length;
    document.querySelectorAll("[data-chip]").forEach(function (c) {
      var d = !!state.done[c.getAttribute("data-chip")];
      c.classList.toggle("done", d);
      c.textContent = d ? "Done ✓" : "To do";
    });
    var tryDone = M.tryTasks.every(function (id) { return state.done[id]; });
    var stepDone = {
      context: true, learn: true, "try": tryDone, build: !!state.done[M.buildTask],
      reflect: (state.reflect || "").trim().length >= 40, check: all
    };
    document.querySelectorAll(".steps a").forEach(function (a) {
      a.classList.toggle("done", !!stepDone[a.getAttribute("data-step")]);
    });
    var list = $("check-status");
    list.innerHTML = "";
    req.forEach(function (id) {
      list.appendChild(el("li", { "class": state.done[id] ? "done" : "" }, (state.done[id] ? "✓ " : "○ ") + M.taskNames[id]));
    });
    $("check-locked").hidden = all;
    $("check-open").hidden = !all;
    $("check-card").classList.toggle("unlocked", all);
    // The completion code is stored as character codes so it doesn't appear as plain text in the page.
    $("code-badge").textContent = all ? M.code.map(function (c) { return String.fromCharCode(c); }).join("") : "";
  }

  /* ---------- init ---------- */
  function init(cfg) {
    M = cfg;
    KEY = "cs-study-hall:" + cfg.id;
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object") state = Object.assign(state, saved);
    } catch (e) {}
    state.extra = state.extra || {};

    var note = $("loadnote");
    if (note && cfg.usesPython) {
      if (python.ready()) { note.hidden = true; }
      else {
        note.textContent = "Python couldn't load, so the Run buttons won't work. Tell a helper or your teacher. (The school network may be blocking cdn.jsdelivr.net.)";
        note.classList.add("bad");
      }
    }

    var draft = $("reflect-draft");
    if (draft) {
      draft.value = state.reflect || "";
      draft.addEventListener("input", function () { state.reflect = draft.value; save(); refresh(); });
      $("copy-reflect").addEventListener("click", function () { copyText(draft.value, $("copy-reflect-msg"), draft); });
    }
    var copyBuild = $("copy-build");
    if (copyBuild && cfg.buildText) {
      copyBuild.addEventListener("click", function () { copyText(cfg.buildText(), $("copy-build-msg"), cfg.buildFallbackEl ? cfg.buildFallbackEl() : null); });
    }

    // Start over takes two taps, since confirm() isn't available everywhere.
    var resetBtn = $("reset");
    var armed = false, timer = null;
    resetBtn.addEventListener("click", function () {
      if (!armed) {
        armed = true; resetBtn.textContent = "Tap again to erase all progress";
        timer = setTimeout(function () { armed = false; resetBtn.textContent = "Start over"; }, 4000);
        return;
      }
      clearTimeout(timer);
      try { localStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    });
    refresh();
  }

  /* ================= Python ================= */
  var python = (function () {
    function ready() { return !window.__skFail && typeof window.Sk !== "undefined"; }

    // iPads often swap in curly quotes and non-breaking spaces; Python needs plain ones.
    function normalize(code) {
      return code
        .replace(/[“”„‟″«»]/g, '"')
        .replace(/[‘’‚‛′]/g, "'")
        .replace(/ /g, " ")
        .replace(/\t/g, "    ");
    }

    // opts.inputs: answers fed to input() in order (for automatic tests).
    // opts.live: a console element; output appears as it happens and input() shows a text box there.
    function run(code, opts) {
      opts = opts || {};
      var out = "";
      var live = opts.live || null;
      var scripted = opts.inputs ? opts.inputs.slice() : null;
      var afterLastInput = 0; // where the output after the last input() answer begins
      function write(t) { out += t; if (live) live.appendChild(document.createTextNode(t)); }
      if (!ready()) return Promise.resolve({ output: "", error: "Python is not loaded." });
      Sk.configure({
        output: write,
        read: function (x) {
          if (!Sk.builtinFiles || !Sk.builtinFiles.files[x]) throw "File not found: " + x;
          return Sk.builtinFiles.files[x];
        },
        __future__: Sk.python3,
        execLimit: 3000,
        inputfunTakesPrompt: true,
        inputfun: function (prompt) {
          write(prompt || "");
          if (scripted || !live) {
            var v = scripted && scripted.length ? String(scripted.shift()) : "";
            write(v + "\n");
            afterLastInput = out.length;
            return v;
          }
          return new Promise(function (resolve) {
            var ask = el("span", { "class": "console-ask" });
            var inp = el("input", { "class": "console-input", "aria-label": prompt || "Type your answer", autocapitalize: "off", autocomplete: "off", autocorrect: "off", spellcheck: "false" });
            var go = el("button", { type: "button", "class": "console-send" }, "Enter");
            ask.appendChild(inp); ask.appendChild(go);
            live.appendChild(ask);
            inp.focus();
            function submit() {
              var v = inp.value;
              live.removeChild(ask);
              write(v + "\n");
              afterLastInput = out.length;
              // Time spent typing shouldn't count toward the run-time limit.
              Sk.execStart = Date.now();
              resolve(v);
            }
            inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
            go.addEventListener("click", submit);
          });
        }
      });
      return Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, code, true);
      }).then(function () {
        return { output: out, error: null, afterInputs: out.slice(afterLastInput) };
      }, function (err) {
        return { output: out, error: String(err), afterInputs: out.slice(afterLastInput) };
      });
    }

    function countChar(s, ch) {
      // Count quote characters, ignoring backslash-escaped ones.
      var n = 0;
      for (var i = 0; i < s.length; i++) { if (s[i] === "\\") { i++; continue; } if (s[i] === ch) n++; }
      return n;
    }
    function parenGap(s) {
      var stripped = s.replace(/"[^"]*"|'[^']*'/g, "");
      return (stripped.match(/\(/g) || []).length - (stripped.match(/\)/g) || []).length;
    }
    function syntaxHint(line, n) {
      if (countChar(line, '"') % 2 === 1 || countChar(line, "'") % 2 === 1)
        return "Line " + n + " has an opening quote but no closing quote. Every string needs a quote at the start and the end.";
      if (parenGap(line) > 0) return "Line " + n + " is missing a closing parenthesis ).";
      if (parenGap(line) < 0) return "Line " + n + " has an extra ) or is missing an opening (.";
      return null;
    }

    // Turn Python's error into advice a first-time programmer can act on.
    function friendly(err, code) {
      var m = /on line (\d+)/.exec(err);
      var n = m ? parseInt(m[1], 10) : null;
      var lines = code.split("\n");
      var line = n ? (lines[n - 1] || "") : "";
      var prev = n && n > 1 ? (lines[n - 2] || "") : "";
      var name = /NameError: name '([^']+)'/.exec(err);
      if (name) {
        var w = name[1];
        if (w.toLowerCase() === "print") return "Python doesn't know “" + w + "”. Use lowercase: print";
        return "Python doesn't know “" + w + "” on line " + n + ". If it's meant to be text, put it in quotes. If it's a variable, check the spelling (capitals count) and make sure you created it on an earlier line.";
      }
      if (/SyntaxError/.test(err)) {
        var block = /^\s*(if|elif|else|for|while|def)\b/;
        var noColon = function (l) { return block.test(l) && !/:\s*(#.*)?$/.test(l); };
        if (n && noColon(line)) return "Line " + n + " needs a colon : at the end. Lines that start with " + line.trim().split(/[\s(:]/)[0] + " always end with a colon.";
        if (n > 1 && noColon(prev)) return "Line " + (n - 1) + " needs a colon : at the end. Lines that start with " + prev.trim().split(/[\s(:]/)[0] + " always end with a colon.";
        if (n && /^\s*(if|elif|while)\b[^=!<>]*[^=!<>]=[^=]/.test(line)) return "On line " + n + ", use == to compare. A single = stores a value in a variable.";
        var indent = function (l) { return l.match(/^\s*/)[0].length; };
        if (n > 1 && /:\s*$/.test(prev) && line.trim() && indent(line) <= indent(prev))
          return "Line " + n + " should be indented 4 spaces, because it belongs to the line above it that ends with a colon.";
        if (n && /^\s+\S/.test(line) && !/:\s*$/.test(prev) && indent(line) > indent(prev))
          return "Line " + n + " starts with extra spaces. In Python, spaces at the start of a line matter. Line it up with the line above it.";
        var h = (n && syntaxHint(line, n)) || (n > 1 && syntaxHint(prev, n - 1));
        if (h) return h;
        // Python sometimes reports the line after the real mistake (or past the end), so scan the whole program.
        for (var i = 0; i < lines.length; i++) { h = syntaxHint(lines[i], i + 1); if (h) return h; }
        if (n && /^\s*print\s+["'f]/.test(line)) return "On line " + n + ", print needs parentheses: print(\"like this\")";
        return "Python couldn't understand line " + (n || "?") + ". Check its quotes, parentheses, and spelling.";
      }
      if (/not supported between instances of 'str' and 'int'|not supported between instances of 'int' and 'str'/.test(err))
        return "On line " + n + " you're comparing text with a number. input() always gives you text, so wrap it in int(), like: age = int(input(\"Age? \"))";
      if (/invalid literal for int\(\)/.test(err)) {
        var bad = /: '(.*)'/.exec(err);
        return "int() can only turn whole-number text like \"25\" into a number" + (bad ? ", but it got \"" + bad[1] + "\"" : "") + ". Check what your program asks for and in what order.";
      }
      if (/missing \d+ required/.test(err)) return "On line " + n + " you called a function without all the information it needs. Put values inside the parentheses.";
      if (/is not callable/.test(err)) return "On line " + n + " you put parentheses after something that isn't a function. Did a variable and a function end up with the same name?";
      if (/has no len\(\)/.test(err)) return "On line " + n + ", len() only works on text and lists, not numbers.";
      if (/IndexError/.test(err)) return "On line " + n + " you asked for a list item past the end of the list. Remember, lists start counting at 0.";
      if (/can't multiply sequence by non-int/.test(err)) return "On line " + n + " you multiplied text by something that isn't a whole number. Text can only be repeated a whole number of times, like \"=\" * 10.";
      if (/concatenate|can only concatenate|unsupported operand/.test(err))
        return "On line " + n + " you're joining text and a number with +. Use an f-string instead, like print(f\"Grade {grade}\").";
      if (/TimeLimitError/.test(err)) return "Your program ran too long and was stopped.";
      if (/IndentationError/.test(err)) return "Line " + n + " has spaces at the start that shouldn't be there.";
      return "Python found a problem" + (n ? " on line " + n : "") + ".";
    }

    function outLines(output) {
      return output.replace(/\s+$/, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    }

    // tests: [{ inputs: [...], append: "extra code", expect(output, result) -> null when right, or a message saying what went wrong }]
    // result.afterInputs is just what the program printed after its last input() answer.
    function runTests(tests, code) {
      var i = 0;
      function next() {
        if (i >= tests.length) return Promise.resolve(null);
        var t = tests[i++];
        // t.append adds lines after the student's code for this test only, e.g. calling their function.
        return run(t.append ? code + "\n" + t.append : code, { inputs: t.inputs || [] }).then(function (r) {
          if (r.error) {
            var when = t.inputs && t.inputs.length ? " when someone types " + t.inputs.join(", then ") : "";
            return { msg: "Your program crashed" + when + ". " + friendly(r.error, code), raw: r.error };
          }
          var m = t.expect(r.output, r);
          return m ? { msg: m } : next();
        });
      }
      return next();
    }

    // configs: { id: { starter, hints, check(result, code) -> result or Promise, tests, okMsg, optional, onRun(code, result|null), errorsGoToCheck } }
    function editors(configs) {
      document.querySelectorAll("[data-editor]").forEach(function (host) {
        var id = host.getAttribute("data-editor");
        var cfg = configs[id];
        var ta = el("textarea", {
          "class": "code", id: "code-" + id, spellcheck: "false", autocapitalize: "off",
          autocomplete: "off", autocorrect: "off", "aria-label": "Python code for " + id
        });
        ta.value = state.code[id] != null ? state.code[id] : cfg.starter;
        var row = el("div", { "class": "row" });
        var runBtn = el("button", { "class": "primary", type: "button" }, "Run");
        var hintBtn = el("button", { "class": "ghost", type: "button" }, "Show a hint");
        var reset = el("button", { "class": "ghost", type: "button" }, "Reset code");
        row.appendChild(runBtn); row.appendChild(hintBtn); row.appendChild(reset);
        var out = el("pre", { "class": "console", "aria-live": "polite" });
        var fb = el("div");
        var hintBox = el("div", { "class": "hints" });
        host.appendChild(ta); host.appendChild(row); host.appendChild(out); host.appendChild(fb); host.appendChild(hintBox);
        hints(id, cfg.hints, hintBtn, hintBox);
        if (cfg.onRun) cfg.onRun(ta.value, null);

        ta.addEventListener("input", function () { state.code[id] = ta.value; save(); });
        ta.addEventListener("keydown", function (e) {
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end");
            state.code[id] = ta.value; save();
          }
        });
        reset.addEventListener("click", function () {
          ta.value = cfg.starter; state.code[id] = cfg.starter; save();
          out.textContent = ""; fb.innerHTML = "";
          if (cfg.onRun) cfg.onRun(ta.value, null);
        });
        runBtn.addEventListener("click", function () {
          var code = normalize(ta.value);
          if (code !== ta.value) { ta.value = code; state.code[id] = code; save(); }
          runBtn.disabled = true; runBtn.textContent = "Running…";
          out.textContent = ""; fb.innerHTML = "";
          run(code, { live: out }).then(function (r) {
            runBtn.disabled = false; runBtn.textContent = "Run";
            if (cfg.onRun) cfg.onRun(code, r);
            if (r.error) {
              // Build tasks also list what's still missing alongside the error.
              var extra = cfg.errorsGoToCheck ? (cfg.check(r, code) || {}).list : null;
              feedback(fb, false, friendly(r.error, code), r.error, extra);
              return;
            }
            // Programs that use input() are also tested quietly with prepared answers.
            return runTests(cfg.tests || [], code).then(function (fail) {
              if (fail) { feedback(fb, false, fail.msg, fail.raw); return; }
              // check may return a result or a Promise of one (for checks that run the program again).
              return Promise.resolve(cfg.check ? cfg.check(r, code) : { ok: true, msg: cfg.okMsg || "It works." }).then(function (res) {
                feedback(fb, res.ok, res.msg, null, res.list);
                if (res.ok && !cfg.optional) markDone(id);
              });
            });
          });
        });
      });
    }

    // opts: { task, lines: [...], expect | tests, hints, trapPattern, trapMsg, okMsg } with elements p-bank, p-prog, p-run, p-hint, p-out, p-fb, p-hints
    function parsons(opts) {
      var bank = $("p-bank"), prog = $("p-prog"), pOut = $("p-out"), pFb = $("p-fb");
      function render() {
        bank.innerHTML = ""; prog.innerHTML = "";
        opts.lines.forEach(function (txt, i) {
          if (state.parsons.indexOf(i) !== -1) return;
          var b = el("button", { "class": "pline", type: "button", "aria-label": "Add line: " + txt }, txt);
          b.addEventListener("click", function () { state.parsons.push(i); save(); render(); });
          bank.appendChild(b);
        });
        state.parsons.forEach(function (i, pos) {
          var b = el("button", { "class": "pline", type: "button", "aria-label": "Remove line " + (pos + 1) + ": " + opts.lines[i] }, opts.lines[i]);
          b.addEventListener("click", function () { state.parsons.splice(pos, 1); save(); render(); });
          prog.appendChild(b);
        });
        if (!state.parsons.length) prog.appendChild(el("div", { "class": "empty" }, "Tap blocks on the left to add them here, in order."));
        if (bank.children.length === 0) bank.appendChild(el("div", { "class": "empty" }, "All blocks used."));
      }
      render();
      hints(opts.task, opts.hints, $("p-hint"), $("p-hints"));
      $("p-run").addEventListener("click", function () {
        var code = state.parsons.map(function (i) { return opts.lines[i]; }).join("\n");
        if (!code) { feedback(pFb, false, "Add some blocks to Your program first."); return; }
        // With tests, the program is run once per test with prepared input() answers.
        if (opts.tests) {
          run(code, { inputs: opts.tests[0].inputs }).then(function (r) {
            pOut.textContent = r.output;
            if (r.error) { feedback(pFb, false, friendly(r.error, code), r.error); return; }
            return runTests(opts.tests, code).then(function (fail) {
              if (fail) { feedback(pFb, false, fail.msg, fail.raw); return; }
              feedback(pFb, true, opts.okMsg || "Correct order.");
              markDone(opts.task);
            });
          });
          return;
        }
        run(code).then(function (r) {
          pOut.textContent = r.output;
          if (r.error) { feedback(pFb, false, friendly(r.error, code), r.error); return; }
          if (r.output.replace(/\s+$/, "") === opts.expect) {
            feedback(pFb, true, opts.okMsg || "Correct order.");
            markDone(opts.task);
          } else if (opts.trapPattern && opts.trapPattern.test(r.output)) {
            feedback(pFb, false, opts.trapMsg);
          } else {
            feedback(pFb, false, "The output doesn't match the goal yet. Compare it line by line with the goal above.");
          }
        });
      });
    }

    return { ready: ready, run: run, runTests: runTests, friendly: friendly, normalize: normalize, outLines: outLines, editors: editors, parsons: parsons };
  })();

  return {
    init: init, el: el, feedback: feedback, markDone: markDone, hints: hints, mc: mc,
    quiz: quiz, answers: answers, matches: matches, order: order, sort: sort, loadModule: loadModule,
    copyText: copyText, save: save, refresh: refresh, python: python,
    get state() { return state; }
  };
})();
