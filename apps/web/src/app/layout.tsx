import type { Metadata } from 'next'
import { Shell } from '../core/shell'
import '../styles/tokens.scss'
export const metadata: Metadata = { title: 'Déjà Vu · Tu trabajo, con menos repetición', description: 'Traspasos de tareas en Ambiguous. Observación, aprobación y seguimiento sin prompts.', robots: { index: false, follow: false } }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body style={{ margin: 0 }}><Shell>{children}</Shell></body></html>
}
