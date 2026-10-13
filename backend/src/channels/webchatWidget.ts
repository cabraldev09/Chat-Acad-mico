// Self-contained script embedded on customer websites. Plain ES5 so it runs
// everywhere; talks to the public /webchat/:token/* endpoints.
const widgetSource = `(function () {
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var src = script.src;
  var token = (src.match(/[?&]token=([^&]+)/) || [])[1];
  if (!token) return;
  var base = src.split('/webchat/')[0] + '/webchat/' + token;
  var storeKey = 'wt_visitor_' + token;
  var visitor;
  try { visitor = localStorage.getItem(storeKey); } catch (e) {}
  if (!visitor) {
    visitor = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(storeKey, visitor); } catch (e) {}
  }
  var after = '';
  var seen = {};
  var open = false;
  var color = '#128c7e';
  var cfg = {};

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html) e.innerHTML = html;
    return e;
  }
  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function http(method, path, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, base + path);
    if (body && !(body instanceof FormData)) x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function () {
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e) {}
      cb && cb(x.status < 400, data);
    };
    x.onerror = function () { cb && cb(false); };
    x.send(body ? (body instanceof FormData ? body : JSON.stringify(body)) : null);
  }

  var root = el('div', 'position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;');
  var btn = el('button', 'width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;color:#fff;font-size:26px;box-shadow:0 4px 14px rgba(0,0,0,.25);', '&#128172;');
  var badge = el('span', 'display:none;position:absolute;top:-4px;right:-4px;background:#e53935;color:#fff;border-radius:10px;font-size:11px;padding:1px 6px;', '');
  var panel = el('div', 'display:none;position:absolute;right:0;bottom:70px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);overflow:hidden;flex-direction:column;');
  var head = el('div', 'padding:14px 16px;color:#fff;font-weight:600;');
  var list = el('div', 'flex:1;overflow-y:auto;padding:12px;background:#f2f2f2;');
  var form = el('form', 'display:flex;gap:6px;padding:8px;border-top:1px solid #ddd;background:#fff;');
  var attach = el('label', 'cursor:pointer;display:flex;align-items:center;padding:0 4px;font-size:18px;', '&#128206;');
  var file = el('input'); file.type = 'file'; file.style.display = 'none'; attach.appendChild(file);
  var input = el('input', 'flex:1;border:1px solid #ccc;border-radius:18px;padding:8px 12px;font-size:14px;outline:none;');
  input.placeholder = 'Digite sua mensagem...';
  var send = el('button', 'border:0;border-radius:18px;padding:0 14px;color:#fff;cursor:pointer;', 'Enviar');
  send.type = 'submit';
  form.appendChild(attach); form.appendChild(input); form.appendChild(send);
  panel.appendChild(head); panel.appendChild(list); panel.appendChild(form);
  btn.style.position = 'relative';
  root.appendChild(panel); root.appendChild(btn); btn.appendChild(badge);
  document.body.appendChild(root);

  function paint() {
    btn.style.background = color; head.style.background = color; send.style.background = color;
    head.textContent = cfg.title || 'Fale conosco';
  }
  function bubble(m) {
    var mine = !m.fromMe; // visitor's own messages are "not fromMe" on the agent side
    var row = el('div', 'display:flex;margin:4px 0;justify-content:' + (mine ? 'flex-end' : 'flex-start') + ';');
    var content = '';
    if (m.mediaUrl) {
      if (m.mediaType === 'image') content += '<img src="' + esc(m.mediaUrl) + '" style="max-width:100%;border-radius:8px;display:block;margin-bottom:4px;">';
      else content += '<a href="' + esc(m.mediaUrl) + '" target="_blank" style="color:inherit;">&#128206; arquivo</a><br>';
    }
    if (m.body && !(m.mediaUrl && m.body.indexOf('.') > 0 && m.body === m.mediaUrl.split('/').pop())) content += esc(m.body).replace(/\\n/g, '<br>');
    var b = el('div', 'max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.35;word-wrap:break-word;background:' + (mine ? color : '#fff') + ';color:' + (mine ? '#fff' : '#222') + ';box-shadow:0 1px 1px rgba(0,0,0,.08);', content);
    row.appendChild(b); list.appendChild(row);
  }
  var unread = 0;
  var typingRow = null;
  function showTyping(on) {
    if (on && !typingRow) {
      typingRow = el('div', 'margin:4px 0;font-size:12px;color:#777;', 'digitando…');
      list.appendChild(typingRow); list.scrollTop = list.scrollHeight;
    } else if (!on && typingRow) { list.removeChild(typingRow); typingRow = null; }
  }
  function poll() {
    http('GET', '/messages?visitorId=' + encodeURIComponent(visitor) + (after ? '&after=' + encodeURIComponent(after) : ''), null, function (ok, data) {
      if (ok && data && data.messages) {
        showTyping(!!data.agentTyping);
        var added = 0;
        data.messages.forEach(function (m) {
          if (seen[m.id]) return;
          seen[m.id] = 1; added++;
          if (typingRow) list.removeChild(typingRow);
          bubble(m);
          if (typingRow) list.appendChild(typingRow);
          after = m.createdAt;
          if (m.fromMe && !open) unread++;
        });
        if (added) list.scrollTop = list.scrollHeight;
        if (unread && !open) { badge.style.display = 'block'; badge.textContent = unread; }
      }
      setTimeout(poll, open ? 2500 : 8000);
    });
  }
  btn.onclick = function () {
    open = !open;
    panel.style.display = open ? 'flex' : 'none';
    if (open) { unread = 0; badge.style.display = 'none'; list.scrollTop = list.scrollHeight; input.focus(); }
  };
  function post(body, fileObj) {
    var done = function () { poll_once(); };
    if (fileObj) {
      var fd = new FormData();
      fd.append('visitorId', visitor); fd.append('body', body || ''); fd.append('file', fileObj);
      http('POST', '/messages', fd, done);
    } else {
      http('POST', '/messages', { visitorId: visitor, body: body }, done);
    }
  }
  function poll_once() {
    http('GET', '/messages?visitorId=' + encodeURIComponent(visitor) + (after ? '&after=' + encodeURIComponent(after) : ''), null, function (ok, data) {
      if (ok && data && data.messages) data.messages.forEach(function (m) {
        if (seen[m.id]) return; seen[m.id] = 1; bubble(m); after = m.createdAt;
      });
      list.scrollTop = list.scrollHeight;
    });
  }
  var lastTyping = 0;
  input.addEventListener('input', function () {
    if (Date.now() - lastTyping < 3000) return;
    lastTyping = Date.now();
    http('POST', '/typing', { visitorId: visitor });
  });
  form.onsubmit = function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text && !file.files[0]) return;
    post(text, file.files[0]);
    input.value = ''; file.value = '';
  };
  http('GET', '/config', null, function (ok, data) {
    if (ok && data) { cfg = data; color = data.color || color; }
    paint();
    if (cfg.welcome) { var w = el('div', 'text-align:center;color:#777;font-size:12px;margin:6px 0 10px;', esc(cfg.welcome)); list.appendChild(w); }
    poll();
  });
})();`;

export default widgetSource;
