'use client'
import { useId, useState } from 'react'
import styles from './ui.module.scss'
export function SecretInput({ label, value, onChange, placeholder, disabled, minLength, maxLength }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean; minLength?: number; maxLength?: number
}) {
  const id = useId(), [visible, setVisible] = useState(false)
  return <div className={styles.label}><label htmlFor={id}>{label}</label><div className={styles.secret}><input id={id} className={styles.input} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} minLength={minLength} maxLength={maxLength} /><button type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label}`} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div></div>
}
