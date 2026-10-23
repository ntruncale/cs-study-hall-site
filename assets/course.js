/* CS in Study Hall: shared behavior for every module.
   A module page calls Course.init({...}) with its id, required tasks and completion code,
   then uses Course.mc, Course.python.editors, Course.python.parsons, etc. for its tasks. */
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
  // opts: { task, container, feedback, choices: [{ text, right, why }] }
  function mc(opts) {
    var wrap = $(opts.container);
    var fb = $(opts.feedback);
    opts.choices.forEach(function (c, i) {
      var b = el("button", { "class": "choice", type: "button" });
      b.appendChild(el("span", { "class": "letter" }, "ABCDEF"[i]));
      b.appendChild(el("pre", null, c.text));
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

    function run(code) {
      var out = "";
      if (!ready()) return Promise.resolve({ output: "", error: "Python is not loaded." });
      Sk.configure({
        output: function (t) { out += t; },
        read: function (x) {
          if (!Sk.builtinFiles || !Sk.builtinFiles.files[x]) throw "File not found: " + x;
          return Sk.builtinFiles.files[x];
        },
        __future__: Sk.python3,
        execLimit: 3000
      });
      return Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, code, true);
      }).then(function () {
        return { output: out, error: null };
      }, function (err) {
        return { output: out, error: String(err) };
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
        if (n && /^\s+\S/.test(line) && !/:\s*$/.test(prev))
          return "Line " + n + " starts with extra spaces. In Python, spaces at the start of a line matter. Delete them.";
        var h = (n && syntaxHint(line, n)) || (n > 1 && syntaxHint(prev, n - 1));
        if (h) return h;
        // Python sometimes reports the line after the real mistake (or past the end), so scan the whole program.
        for (var i = 0; i < lines.length; i++) { h = syntaxHint(lines[i], i + 1); if (h) return h; }
        if (n && /^\s*print\s+["'f]/.test(line)) return "On line " + n + ", print needs parentheses: print(\"like this\")";
        return "Python couldn't understand line " + (n || "?") + ". Check its quotes, parentheses, and spelling.";
      }
      if (/concatenate|can only concatenate|unsupported operand/.test(err))
        return "On line " + n + " you're joining text and a number with +. Use an f-string instead, like print(f\"Grade {grade}\").";
      if (/TimeLimitError/.test(err)) return "Your program ran too long and was stopped.";
      if (/IndentationError/.test(err)) return "Line " + n + " has spaces at the start that shouldn't be there.";
      return "Python found a problem" + (n ? " on line " + n : "") + ".";
    }

    function outLines(output) {
      return output.replace(/\s+$/, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    }

    // configs: { id: { starter, hints, check(result, code), optional, onRun(code, result|null), errorsGoToCheck } }
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
          run(code).then(function (r) {
            runBtn.disabled = false; runBtn.textContent = "Run";
            out.textContent = r.output;
            if (cfg.onRun) cfg.onRun(code, r);
            if (r.error) {
              // Build tasks also list what's still missing alongside the error.
              var extra = cfg.errorsGoToCheck ? cfg.check(r, code).list : null;
              feedback(fb, false, friendly(r.error, code), r.error, extra);
              return;
            }
            var res = cfg.check(r, code);
            feedback(fb, res.ok, res.msg, null, res.list);
            if (res.ok && !cfg.optional) markDone(id);
          });
        });
      });
    }

    // opts: { task, lines: [...], expect, hints, trapPattern, trapMsg } with elements p-bank, p-prog, p-run, p-hint, p-out, p-fb, p-hints
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

    return { ready: ready, run: run, friendly: friendly, normalize: normalize, outLines: outLines, editors: editors, parsons: parsons };
  })();

  return {
    init: init, el: el, feedback: feedback, markDone: markDone, hints: hints, mc: mc,
    copyText: copyText, save: save, refresh: refresh, python: python,
    get state() { return state; }
  };
})();
