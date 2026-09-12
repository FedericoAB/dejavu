// La pagina anfitriona no recibe credenciales ni contenido del panel.
const host = document.createElement('div')
host.id = 'dejavu-handoff'
const shadow = host.attachShadow({ mode: 'closed' })
const toggle = document.createElement('button')
toggle.textContent = 'Déjà Vu ↗'
toggle.setAttribute('aria-expanded', 'false')
toggle.style.cssText = 'position:fixed;bottom:20px;right:24px;z-index:2147483647;background:#233f36;color:white;border:1px solid #bfe3ae;border-radius:24px;padding:13px 20px;font:600 15px system-ui;cursor:pointer'
const panel = document.createElement('iframe')
panel.title = 'Déjà Vu — traspasos de tareas'
panel.src = chrome.runtime.getURL('panel.html')
panel.style.cssText = 'display:none;position:fixed;bottom:78px;right:24px;width:min(420px,calc(100vw - 32px));height:min(760px,calc(100vh - 100px));border:1px solid #d5d8ca;border-radius:18px;z-index:2147483647;background:#f6f7ef;box-shadow:0 15px 55px #0003'
toggle.onclick = () => {
  const open = panel.style.display === 'none'
  panel.style.display = open ? 'block' : 'none'
  toggle.setAttribute('aria-expanded', String(open))
}
shadow.append(toggle, panel)
document.documentElement.append(host)
