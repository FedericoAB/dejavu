// La página anfitriona no recibe credenciales ni contenido del panel.
if (!document.getElementById('dejavu-handoff')) {
  const host = document.createElement('div')
  host.id = 'dejavu-handoff'
  const shadow = host.attachShadow({ mode: 'closed' })
  const styles = document.createElement('style')
  styles.textContent = `
    button { position:fixed;bottom:20px;right:24px;z-index:2147483647;background:#233f36;color:white;border:1px solid #bfe3ae;border-radius:24px;padding:13px 20px;font:600 15px system-ui;cursor:pointer; }
    button:focus-visible { outline:3px solid #a5c870;outline-offset:3px; }
    iframe { position:fixed;bottom:78px;right:16px;width:min(420px,calc(100vw - 32px));height:min(760px,calc(100dvh - 100px));border:1px solid #d5d8ca;border-radius:18px;z-index:2147483647;background:#f6f7ef;box-shadow:0 15px 55px #0003; }
    iframe[hidden] { display:none; }
  `
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.textContent = 'Déjà Vu ↗'
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', 'dejavu-panel')
  const panel = document.createElement('iframe')
  panel.id = 'dejavu-panel'
  panel.title = 'Déjà Vu — traspasos de tareas'
  panel.src = chrome.runtime.getURL('panel.html')
  panel.hidden = true
  toggle.onclick = () => {
    panel.hidden = !panel.hidden
    toggle.setAttribute('aria-expanded', String(!panel.hidden))
    toggle.textContent = panel.hidden ? 'Déjà Vu ↗' : 'Cerrar Déjà Vu ×'
    if (!panel.hidden) panel.focus()
  }
  shadow.append(styles, toggle, panel)
  document.documentElement.append(host)
}
