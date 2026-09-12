import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import styles from './ui.module.scss'

export function Button({ secondary, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} className={`${styles.button} ${secondary ? styles.secondary : ''} ${className}`} />
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>
}
export function Input({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={styles.label}>{label}<input {...props} className={styles.input} /></label>
}
export function Textarea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className={styles.label}>{label}<textarea {...props} className={styles.input} /></label>
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}
export function Loading() { return <div className={styles.loading} role="status" aria-live="polite"><p>Cargando tu workspace…</p><div /><div /><div /></div> }
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.empty}><span aria-hidden="true">↗</span><h3>{title}</h3>{children && <p>{children}</p>}</div>
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className={styles.error} role="alert"><p>{message}</p>{retry && <Button secondary onClick={retry}>Reintentar lectura</Button>}</div>
}
